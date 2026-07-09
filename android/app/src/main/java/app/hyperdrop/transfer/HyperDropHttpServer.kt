package app.hyperdrop.transfer

import android.content.Context
import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import com.getcapacitor.JSObject

/**
 * HyperDrop Embedded HTTP Server — NanoHTTPD
 *
 * Implements the same endpoint contract as the desktop companion's
 * Express server (src/shared/protocol.ts ENDPOINTS), running entirely
 * inside the Android app process.
 *
 * This is the core of the LocalSend-style architecture: every device
 * runs its own HTTP server, no cloud relay needed.
 */
class HyperDropHttpServer(
    port: Int,
    private val appContext: Context,
    private val plugin: LocalServerPlugin
) : NanoHTTPD(port) {

    companion object {
        private const val TAG = "HyperDropHTTP"
        private const val CHUNK_SIZE = 8 * 1024 * 1024 // 8 MB — matches client
        private const val SESSION_HEADER = "X-HyperDrop-Session"
        private const val CONSENT_TIMEOUT_SECONDS = 30L
    }

    // Downloads directory
    private val downloadsDir: File by lazy {
        val dir = File(appContext.getExternalFilesDir(null), "hyperdrop-downloads")
        if (!dir.exists()) dir.mkdirs()
        dir
    }

    // ─── Transfer State ──────────────────────────────────────────
    data class TransferSession(
        val sessionId: String,
        val sessionToken: String,
        val fileName: String,
        val fileSize: Long,
        val totalChunks: Int,
        val receivedChunks: ConcurrentHashMap<Int, Boolean> = ConcurrentHashMap(),
        val partFile: File,
        val finalFile: File,
        var status: String = "active", // active | complete | error | cancelled
        var lastSeen: Long = System.currentTimeMillis()
    )

    private val sessions = ConcurrentHashMap<String, TransferSession>()

    // ─── Consent Synchronization ─────────────────────────────────
    data class ConsentResult(
        val accepted: Boolean,
        val sessionToken: String,
        val reason: String
    )

    private val pendingConsents = ConcurrentHashMap<String, CountDownLatch>()
    private val consentResults = ConcurrentHashMap<String, ConsentResult>()

    // ─── Chat & Clipboard Buffers ────────────────────────────────
    private val chatMessages = mutableListOf<JSONObject>()
    private val clipboardEntries = mutableListOf<JSONObject>()

    // ═══════════════════════════════════════════════════════════════
    //  REQUEST ROUTER
    // ═══════════════════════════════════════════════════════════════

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        val method = session.method

        // Add CORS headers to all responses
        return try {
            when {
                // OPTIONS preflight
                method == Method.OPTIONS -> corsResponse(newFixedLengthResponse(""))

                // GET /api/ping
                uri == "/api/ping" && method == Method.GET ->
                    corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json", """{"status":"ok"}"""))

                // GET /api/info
                uri == "/api/info" && method == Method.GET ->
                    handleInfo()

                // POST /api/transfer/prepare
                uri == "/api/transfer/prepare" && method == Method.POST ->
                    handlePrepare(session)

                // PUT /api/chunk
                uri == "/api/chunk" && method == Method.PUT ->
                    handleChunkUpload(session)

                // POST /api/upload-stream
                uri == "/api/upload-stream" && method == Method.POST ->
                    handleStreamUpload(session)

                // GET /download/:fileName
                uri.startsWith("/download/") && method == Method.GET ->
                    handleDownload(session, uri.removePrefix("/download/"))

                // GET /api/session/:id/status
                uri.matches(Regex("/api/session/.+/status")) && method == Method.GET ->
                    handleSessionStatus(uri)

                // POST /api/chat/send
                uri == "/api/chat/send" && method == Method.POST ->
                    handleChatSend(session)

                // GET /api/chat/poll
                uri == "/api/chat/poll" && method == Method.GET ->
                    handleChatPoll(session)

                // POST /api/clipboard/sync
                uri == "/api/clipboard/sync" && method == Method.POST ->
                    handleClipboardSync(session)

                // GET /api/clipboard/poll
                uri == "/api/clipboard/poll" && method == Method.GET ->
                    handleClipboardPoll(session)

                else ->
                    corsResponse(newFixedLengthResponse(Response.Status.NOT_FOUND, "application/json",
                        """{"error":"Not found","uri":"$uri"}"""))
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Request error: $uri", e)
            corsResponse(newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json",
                """{"error":"Internal error","details":"${e.message?.replace("\"", "'")}"}"""))
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  GET /api/info
    // ═══════════════════════════════════════════════════════════════

    private fun handleInfo(): Response {
        val json = JSONObject().apply {
            put("alias", android.os.Build.MODEL ?: "Android Device")
            put("fingerprint", "") // Filled by JS layer
            put("deviceType", "mobile")
            put("port", listeningPort)
            put("version", "1.0")
        }
        return corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json", json.toString()))
    }

    // ═══════════════════════════════════════════════════════════════
    //  POST /api/transfer/prepare — Consent Handshake
    // ═══════════════════════════════════════════════════════════════

    private fun handlePrepare(session: IHTTPSession): Response {
        val body = readBody(session)
        val json = JSONObject(body)
        val sessionId = json.getString("sessionId")

        // Notify JS layer about the incoming transfer
        val jsData = JSObject()
        jsData.put("sessionId", sessionId)
        jsData.put("senderAlias", json.optString("senderAlias", "Unknown"))
        jsData.put("senderFingerprint", json.optString("senderFingerprint", ""))
        jsData.put("senderPublicKey", json.optString("senderPublicKey", ""))

        val filesArray = json.optJSONArray("files")
        jsData.put("files", filesArray?.toString() ?: "[]")

        var totalSize = 0L
        val fileCount = filesArray?.length() ?: 0
        for (i in 0 until fileCount) {
            totalSize += filesArray!!.getJSONObject(i).optLong("size", 0)
        }
        jsData.put("totalSize", totalSize)
        jsData.put("fileCount", fileCount)

        // Set up consent synchronization
        val latch = CountDownLatch(1)
        pendingConsents[sessionId] = latch

        // Notify JS (this triggers the consent modal)
        plugin.notifyIncomingTransfer(jsData)

        // Block this HTTP thread until JS responds or timeout
        val answered = latch.await(CONSENT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        pendingConsents.remove(sessionId)

        if (!answered) {
            consentResults.remove(sessionId)
            val response = JSONObject().apply {
                put("sessionId", sessionId)
                put("accepted", false)
                put("acceptedFileIds", JSONArray())
                put("reason", "Consent timed out")
            }
            return corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json", response.toString()))
        }

        val result = consentResults.remove(sessionId)
        if (result == null || !result.accepted) {
            val response = JSONObject().apply {
                put("sessionId", sessionId)
                put("accepted", false)
                put("acceptedFileIds", JSONArray())
                put("reason", result?.reason ?: "Declined")
            }
            return corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json", response.toString()))
        }

        // Accepted — create sessions for each file
        val acceptedIds = JSONArray()
        for (i in 0 until fileCount) {
            val fileJson = filesArray!!.getJSONObject(i)
            val fileId = fileJson.getString("id")
            val fileName = fileJson.getString("name")
            val fileSize = fileJson.getLong("size")
            val totalChunks = ((fileSize + CHUNK_SIZE - 1) / CHUNK_SIZE).toInt()

            val partFile = File(downloadsDir, "$fileName.part")
            val finalFile = File(downloadsDir, fileName)

            // Pre-allocate the part file
            RandomAccessFile(partFile, "rw").use { raf ->
                raf.setLength(fileSize)
            }

            sessions[fileId] = TransferSession(
                sessionId = sessionId,
                sessionToken = result.sessionToken,
                fileName = fileName,
                fileSize = fileSize,
                totalChunks = totalChunks,
                partFile = partFile,
                finalFile = finalFile
            )
            acceptedIds.put(fileId)
        }

        val response = JSONObject().apply {
            put("sessionId", sessionId)
            put("accepted", true)
            put("acceptedFileIds", acceptedIds)
            put("sessionToken", result.sessionToken)
        }
        return corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json", response.toString()))
    }

    /**
     * Called by LocalServerPlugin when JS responds to a consent dialog.
     */
    fun handleTransferResponse(sessionId: String, accepted: Boolean, sessionToken: String, reason: String) {
        consentResults[sessionId] = ConsentResult(accepted, sessionToken, reason)
        pendingConsents[sessionId]?.countDown()
    }

    // ═══════════════════════════════════════════════════════════════
    //  SESSION VALIDATION — Rejects uploads without a valid token
    // ═══════════════════════════════════════════════════════════════

    /**
     * Validates the X-HyperDrop-Session header against active sessions.
     * Returns an error Response on failure, null on success.
     * Refreshes session expiry on valid requests (sliding 5-min window).
     */
    private fun validateSession(session: IHTTPSession): Response? {
        val token = session.headers[SESSION_HEADER.lowercase()]
            ?: session.headers["x-hyperdrop-session"]

        if (token.isNullOrBlank()) {
            android.util.Log.w(TAG, "Rejected upload — no session token (${session.method} ${session.uri})")
            return corsResponse(newFixedLengthResponse(
                Response.Status.FORBIDDEN, "application/json",
                """{"error":"Invalid or missing session token"}"""
            ))
        }

        // Find any session with a matching, non-expired token
        val now = System.currentTimeMillis()
        val matched = sessions.values.any { tx ->
            tx.sessionToken == token && tx.lastSeen + 5 * 60 * 1000 > now
        }

        if (!matched) {
            android.util.Log.w(TAG, "Rejected upload — invalid/expired session token (${session.method} ${session.uri})")
            return corsResponse(newFixedLengthResponse(
                Response.Status.FORBIDDEN, "application/json",
                """{"error":"Invalid or expired session token"}"""
            ))
        }

        return null // Validation passed
    }

    // ═══════════════════════════════════════════════════════════════
    //  PUT /api/chunk — Parallel Chunk Upload
    // ═══════════════════════════════════════════════════════════════

    private fun handleChunkUpload(session: IHTTPSession): Response {
        // ── Session token enforcement ──
        validateSession(session)?.let { return it }

        val headers = session.headers
        val transferId = headers["x-transfer-id"] ?: return errorResponse("Missing X-Transfer-Id")
        val chunkIndex = headers["x-chunk-index"]?.toIntOrNull() ?: return errorResponse("Missing X-Chunk-Index")
        val totalChunks = headers["x-total-chunks"]?.toIntOrNull() ?: return errorResponse("Missing X-Total-Chunks")
        val fileName = headers["x-file-name"]?.let { java.net.URLDecoder.decode(it, "UTF-8") }
            ?: return errorResponse("Missing X-File-Name")
        val fileSize = headers["x-file-size"]?.toLongOrNull() ?: return errorResponse("Missing X-File-Size")

        // Find existing session — must have been created via PrepareRequest
        val txSession = sessions[transferId]
        if (txSession == null) {
            android.util.Log.w(TAG, "Rejected chunk — no PrepareRequest session for transfer $transferId")
            return corsResponse(newFixedLengthResponse(
                Response.Status.FORBIDDEN, "application/json",
                """{"error":"No active transfer session. Send PrepareRequest first."}"""
            ))
        }

        txSession.lastSeen = System.currentTimeMillis()

        // Skip duplicate chunks
        if (txSession.receivedChunks.containsKey(chunkIndex)) {
            return corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json",
                """{"status":"duplicate","chunkIndex":$chunkIndex}"""))
        }

        // Read the raw body
        val contentLength = headers["content-length"]?.toIntOrNull() ?: 0
        val bodyBytes = ByteArray(contentLength)
        var totalRead = 0
        while (totalRead < contentLength) {
            val read = session.inputStream.read(bodyBytes, totalRead, contentLength - totalRead)
            if (read == -1) break
            totalRead += read
        }

        // Write at exact byte offset
        val offset = chunkIndex.toLong() * CHUNK_SIZE
        RandomAccessFile(txSession.partFile, "rw").use { raf ->
            raf.seek(offset)
            raf.write(bodyBytes, 0, totalRead)
        }
        txSession.receivedChunks[chunkIndex] = true

        // Check completion
        if (txSession.receivedChunks.size >= txSession.totalChunks) {
            txSession.partFile.renameTo(txSession.finalFile)
            txSession.status = "complete"
            android.util.Log.i(TAG, "Transfer complete: ${txSession.fileName}")

            // Notify JS
            val jsData = JSObject()
            jsData.put("transferId", transferId)
            jsData.put("fileName", txSession.fileName)
            jsData.put("fileSize", txSession.fileSize)
            jsData.put("filePath", txSession.finalFile.absolutePath)
            plugin.notifyTransferComplete(jsData)

            return corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json",
                """{"status":"complete","fileName":"${txSession.fileName}","progress":100}"""))
        }

        val progress = (txSession.receivedChunks.size * 100) / txSession.totalChunks
        return corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json",
            """{"status":"ok","chunkIndex":$chunkIndex,"received":${txSession.receivedChunks.size},"total":${txSession.totalChunks},"progress":$progress}"""))
    }

    // ═══════════════════════════════════════════════════════════════
    //  POST /api/upload-stream — Streaming Upload
    // ═══════════════════════════════════════════════════════════════

    private fun handleStreamUpload(session: IHTTPSession): Response {
        // ── Session token enforcement ──
        validateSession(session)?.let { return it }

        val headers = session.headers
        val fileName = headers["x-file-name"]?.let { java.net.URLDecoder.decode(it, "UTF-8") }
            ?: return errorResponse("Missing X-File-Name")
        val transferId = headers["x-transfer-id"] ?: return errorResponse("Missing X-Transfer-Id")
        val fileSize = headers["x-file-size"]?.toLongOrNull() ?: return errorResponse("Missing X-File-Size")

        val finalFile = File(downloadsDir, fileName)
        val partFile = File(downloadsDir, "$fileName.part")

        try {
            FileOutputStream(partFile).use { fos ->
                val buf = ByteArray(64 * 1024) // 64KB read buffer
                var totalReceived = 0L
                while (totalReceived < fileSize) {
                    val read = session.inputStream.read(buf)
                    if (read == -1) break
                    fos.write(buf, 0, read)
                    totalReceived += read
                }
            }

            partFile.renameTo(finalFile)
            android.util.Log.i(TAG, "Stream upload complete: $fileName")

            val jsData = JSObject()
            jsData.put("transferId", transferId)
            jsData.put("fileName", fileName)
            jsData.put("fileSize", fileSize)
            jsData.put("filePath", finalFile.absolutePath)
            plugin.notifyTransferComplete(jsData)

            return corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json",
                """{"status":"complete","fileName":"$fileName"}"""))
        } catch (e: Exception) {
            partFile.delete()
            return corsResponse(newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json",
                """{"error":"Upload failed","details":"${e.message?.replace("\"", "'")}"}"""))
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  GET /download/:fileName — Range-Aware Download
    // ═══════════════════════════════════════════════════════════════

    private fun handleDownload(session: IHTTPSession, encodedFileName: String): Response {
        val fileName = java.net.URLDecoder.decode(encodedFileName, "UTF-8")
        val file = File(downloadsDir, fileName)

        if (!file.exists() || !file.canonicalPath.startsWith(downloadsDir.canonicalPath)) {
            return corsResponse(newFixedLengthResponse(Response.Status.NOT_FOUND, "application/json",
                """{"error":"File not found"}"""))
        }

        val fileSize = file.length()
        val rangeHeader = session.headers["range"]

        if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
            // Partial content (Range request)
            val rangeParts = rangeHeader.removePrefix("bytes=").split("-")
            val start = rangeParts[0].toLongOrNull() ?: 0
            val end = if (rangeParts.size > 1 && rangeParts[1].isNotEmpty())
                rangeParts[1].toLongOrNull() ?: (fileSize - 1)
            else fileSize - 1

            val chunkSize = end - start + 1
            val fis = java.io.FileInputStream(file)
            fis.skip(start)

            val response = newFixedLengthResponse(
                Response.Status.PARTIAL_CONTENT,
                "application/octet-stream",
                fis,
                chunkSize
            )
            response.addHeader("Content-Range", "bytes $start-$end/$fileSize")
            response.addHeader("Accept-Ranges", "bytes")
            response.addHeader("Content-Disposition", "attachment; filename=\"${java.net.URLEncoder.encode(fileName, "UTF-8")}\"")
            return corsResponse(response)
        }

        // Full file download
        val fis = java.io.FileInputStream(file)
        val response = newFixedLengthResponse(
            Response.Status.OK,
            "application/octet-stream",
            fis,
            fileSize
        )
        response.addHeader("Content-Disposition", "attachment; filename=\"${java.net.URLEncoder.encode(fileName, "UTF-8")}\"")
        response.addHeader("Accept-Ranges", "bytes")
        return corsResponse(response)
    }

    // ═══════════════════════════════════════════════════════════════
    //  GET /api/session/:id/status
    // ═══════════════════════════════════════════════════════════════

    private fun handleSessionStatus(uri: String): Response {
        val sessionId = uri.removePrefix("/api/session/").removeSuffix("/status")
        val txSession = sessions[sessionId]

        if (txSession == null) {
            return corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json",
                """{"sessionId":"$sessionId","receivedChunks":[],"totalChunks":0,"totalReceived":0,"totalSize":0,"status":"unknown"}"""))
        }

        val receivedChunksList = txSession.receivedChunks.keys().toList()
        val totalReceived = receivedChunksList.size.toLong() * CHUNK_SIZE
        val json = JSONObject().apply {
            put("sessionId", sessionId)
            put("receivedChunks", JSONArray(receivedChunksList))
            put("totalChunks", txSession.totalChunks)
            put("totalReceived", minOf(totalReceived, txSession.fileSize))
            put("totalSize", txSession.fileSize)
            put("status", txSession.status)
        }
        return corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json", json.toString()))
    }

    // ═══════════════════════════════════════════════════════════════
    //  CHAT — POST /api/chat/send + GET /api/chat/poll
    // ═══════════════════════════════════════════════════════════════

    private fun handleChatSend(session: IHTTPSession): Response {
        val body = readBody(session)
        val json = JSONObject(body)

        synchronized(chatMessages) {
            chatMessages.add(json)
            // Keep last 200 messages
            while (chatMessages.size > 200) chatMessages.removeAt(0)
        }

        // Notify JS layer
        val jsData = JSObject()
        jsData.put("id", json.optString("id"))
        jsData.put("text", json.optString("text"))
        jsData.put("senderFingerprint", json.optString("senderFingerprint"))
        jsData.put("senderAlias", json.optString("senderAlias"))
        jsData.put("timestamp", json.optLong("timestamp"))
        jsData.put("isCode", json.optBoolean("isCode", false))
        plugin.notifyChatMessage(jsData)

        return corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json", """{"status":"ok"}"""))
    }

    private fun handleChatPoll(session: IHTTPSession): Response {
        val since = session.parameters["since"]?.firstOrNull()?.toLongOrNull() ?: 0

        val newMessages = synchronized(chatMessages) {
            chatMessages.filter { it.optLong("timestamp", 0) > since }
        }

        val json = JSONObject().apply {
            put("messages", JSONArray(newMessages))
            put("serverTime", System.currentTimeMillis())
        }
        return corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json", json.toString()))
    }

    // ═══════════════════════════════════════════════════════════════
    //  CLIPBOARD — POST /api/clipboard/sync + GET /api/clipboard/poll
    // ═══════════════════════════════════════════════════════════════

    private fun handleClipboardSync(session: IHTTPSession): Response {
        val body = readBody(session)
        val json = JSONObject(body)

        synchronized(clipboardEntries) {
            clipboardEntries.add(json)
            while (clipboardEntries.size > 50) clipboardEntries.removeAt(0)
        }

        // Notify JS layer
        val jsData = JSObject()
        jsData.put("id", json.optString("id"))
        jsData.put("content", json.optString("content"))
        jsData.put("contentType", json.optString("contentType", "text"))
        jsData.put("senderFingerprint", json.optString("senderFingerprint"))
        jsData.put("senderAlias", json.optString("senderAlias"))
        jsData.put("timestamp", json.optLong("timestamp"))
        plugin.notifyClipboardSync(jsData)

        return corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json", """{"status":"ok"}"""))
    }

    private fun handleClipboardPoll(session: IHTTPSession): Response {
        val since = session.parameters["since"]?.firstOrNull()?.toLongOrNull() ?: 0

        val newEntries = synchronized(clipboardEntries) {
            clipboardEntries.filter { it.optLong("timestamp", 0) > since }
        }

        val json = JSONObject().apply {
            put("entries", JSONArray(newEntries))
            put("serverTime", System.currentTimeMillis())
        }
        return corsResponse(newFixedLengthResponse(Response.Status.OK, "application/json", json.toString()))
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════

    private fun readBody(session: IHTTPSession): String {
        val contentLength = session.headers["content-length"]?.toIntOrNull() ?: 0
        if (contentLength == 0) return "{}"

        val bodyMap = HashMap<String, String>()
        session.parseBody(bodyMap)
        return bodyMap["postData"] ?: "{}"
    }

    private fun errorResponse(message: String): Response {
        return corsResponse(newFixedLengthResponse(
            Response.Status.BAD_REQUEST, "application/json",
            """{"error":"$message"}"""
        ))
    }

    private fun corsResponse(response: Response): Response {
        response.addHeader("Access-Control-Allow-Origin", "*")
        response.addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        response.addHeader("Access-Control-Allow-Headers", "Content-Type, X-Transfer-Id, X-Chunk-Index, X-Total-Chunks, X-File-Name, X-File-Size, $SESSION_HEADER")
        response.addHeader("Access-Control-Max-Age", "86400")
        return response
    }
}
