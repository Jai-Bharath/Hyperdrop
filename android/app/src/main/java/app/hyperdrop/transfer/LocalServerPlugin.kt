package app.hyperdrop.transfer

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.JSObject
import com.getcapacitor.annotation.CapacitorPlugin
import java.net.MulticastSocket
import java.net.InetAddress
import java.net.DatagramPacket

/**
 * HyperDrop LocalServer Capacitor Plugin
 *
 * Provides native Android networking capabilities that cannot be accessed
 * from a WebView:
 *   - Embedded NanoHTTPD HTTP server (port 53317)
 *   - UDP multicast send/receive for peer discovery
 *   - MulticastLock for reliable multicast on Wi-Fi
 *   - Local IP address resolution via WifiManager
 *
 * This is the Android equivalent of what LocalSend does natively in Flutter.
 */
@CapacitorPlugin(name = "LocalServer")
class LocalServerPlugin : Plugin() {
    private var httpServer: HyperDropHttpServer? = null
    private var multicastSocket: MulticastSocket? = null
    private var discoveryThread: Thread? = null
    private var multicastLock: android.net.wifi.WifiManager.MulticastLock? = null

    companion object {
        private const val MULTICAST_ADDR = "239.255.83.17"
        private const val MULTICAST_PORT = 53317
        private const val TAG = "LocalServer"
    }

    // ═══════════════════════════════════════════════════════════════
    //  HTTP SERVER — NanoHTTPD
    // ═══════════════════════════════════════════════════════════════

    @PluginMethod
    fun startServer(call: PluginCall) {
        val port = call.getInt("port") ?: MULTICAST_PORT
        try {
            if (httpServer != null) {
                httpServer?.stop()
            }
            httpServer = HyperDropHttpServer(port, context, this)
            httpServer?.start(60000, false)
            android.util.Log.i(TAG, "HTTP server started on port $port")
            call.resolve()
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to start HTTP server", e)
            call.reject("Failed to start local server: ${e.message}")
        }
    }

    @PluginMethod
    fun stopServer(call: PluginCall) {
        try {
            httpServer?.stop()
            httpServer = null
            android.util.Log.i(TAG, "HTTP server stopped")
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to stop server: ${e.message}")
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  UDP MULTICAST DISCOVERY
    // ═══════════════════════════════════════════════════════════════

    @PluginMethod
    fun startDiscovery(call: PluginCall) {
        try {
            // Acquire MulticastLock — REQUIRED on Android or multicast
            // packets are silently dropped by the Wi-Fi chipset's
            // power-saving mode
            val wifiManager = context.applicationContext
                .getSystemService(android.content.Context.WIFI_SERVICE)
                as android.net.wifi.WifiManager
            multicastLock = wifiManager.createMulticastLock("hyperdrop-discovery")
            multicastLock?.setReferenceCounted(true)
            multicastLock?.acquire()
            android.util.Log.i(TAG, "MulticastLock acquired")

            // Create and bind multicast socket
            multicastSocket = MulticastSocket(MULTICAST_PORT)
            multicastSocket?.reuseAddress = true
            val group = InetAddress.getByName(MULTICAST_ADDR)
            multicastSocket?.joinGroup(group)
            android.util.Log.i(TAG, "Joined multicast group $MULTICAST_ADDR:$MULTICAST_PORT")

            // Receive thread — forwards packets to JS layer
            discoveryThread = Thread {
                val buf = ByteArray(2048)
                while (!Thread.currentThread().isInterrupted) {
                    try {
                        val packet = DatagramPacket(buf, buf.size)
                        multicastSocket?.receive(packet)
                        val msg = String(packet.data, 0, packet.length, Charsets.UTF_8)
                        val fromIp = packet.address?.hostAddress ?: "unknown"

                        val ret = JSObject()
                        ret.put("message", msg)
                        ret.put("fromIp", fromIp)
                        notifyListeners("peerAnnounce", ret)
                    } catch (e: java.net.SocketException) {
                        // Socket closed during shutdown — expected, break the loop
                        if (Thread.currentThread().isInterrupted) break
                        android.util.Log.w(TAG, "Multicast receive socket error: ${e.message}")
                    } catch (e: Exception) {
                        if (Thread.currentThread().isInterrupted) break
                        android.util.Log.e(TAG, "Discovery receive error", e)
                    }
                }
                android.util.Log.i(TAG, "Discovery receive thread exiting")
            }
            discoveryThread?.isDaemon = true
            discoveryThread?.name = "HyperDrop-Discovery"
            discoveryThread?.start()

            call.resolve()
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Discovery start failed", e)
            call.reject("Discovery start failed: ${e.message}")
        }
    }

    @PluginMethod
    fun stopDiscovery(call: PluginCall) {
        try {
            discoveryThread?.interrupt()
            discoveryThread = null

            try {
                val group = InetAddress.getByName(MULTICAST_ADDR)
                multicastSocket?.leaveGroup(group)
            } catch (_: Exception) { }

            multicastSocket?.close()
            multicastSocket = null

            if (multicastLock?.isHeld == true) {
                multicastLock?.release()
            }
            multicastLock = null

            android.util.Log.i(TAG, "Discovery stopped")
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to stop discovery: ${e.message}")
        }
    }

    @PluginMethod
    fun sendAnnounce(call: PluginCall) {
        val message = call.getString("message") ?: run {
            call.reject("message is required")
            return
        }
        try {
            val group = InetAddress.getByName(MULTICAST_ADDR)
            val data = message.toByteArray(Charsets.UTF_8)
            val packet = DatagramPacket(data, data.size, group, MULTICAST_PORT)

            // Send on a background thread to avoid blocking the JS bridge
            Thread {
                try {
                    multicastSocket?.send(packet)
                } catch (e: Exception) {
                    android.util.Log.e(TAG, "Announce send failed", e)
                }
            }.start()

            call.resolve()
        } catch (e: Exception) {
            call.reject("Send failed: ${e.message}")
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  LOCAL IP ADDRESS
    // ═══════════════════════════════════════════════════════════════

    @Suppress("DEPRECATION")
    @PluginMethod
    fun getLocalIpAddress(call: PluginCall) {
        try {
            // Method 1: Try WifiManager (works when phone is WiFi CLIENT)
            val wifiManager = context.applicationContext
                .getSystemService(android.content.Context.WIFI_SERVICE)
                as android.net.wifi.WifiManager
            val ipInt = wifiManager.connectionInfo.ipAddress

            if (ipInt != 0) {
                val ip = String.format(
                    "%d.%d.%d.%d",
                    ipInt and 0xff,
                    ipInt shr 8 and 0xff,
                    ipInt shr 16 and 0xff,
                    ipInt shr 24 and 0xff
                )
                val ret = JSObject()
                ret.put("ip", ip)
                call.resolve(ret)
                return
            }

            // Method 2: Scan NetworkInterfaces (works when phone is HOTSPOT/AP)
            // On hotspot mode, WifiManager returns 0 because the phone isn't
            // "connected to" WiFi — it IS the WiFi. The AP interface (ap0, swlan0,
            // wlan0, etc.) still has a valid IP, typically 192.168.43.1.
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            if (interfaces != null) {
                // Priority: prefer ap0/swlan0 (hotspot interfaces), then wlan0, then any
                val candidates = mutableListOf<String>()

                for (intf in interfaces) {
                    if (!intf.isUp || intf.isLoopback) continue

                    for (addr in intf.inetAddresses) {
                        if (addr.isLoopbackAddress) continue
                        if (addr is java.net.Inet6Address) continue // Skip IPv6

                        val ip = addr.hostAddress ?: continue
                        if (ip.startsWith("127.")) continue

                        // Hotspot interfaces have higher priority
                        val name = intf.name.lowercase()
                        if (name.startsWith("ap") || name.startsWith("swlan") || name.startsWith("rndis")) {
                            // This is almost certainly the hotspot interface
                            val ret = JSObject()
                            ret.put("ip", ip)
                            android.util.Log.i(TAG, "IP from hotspot interface ${intf.name}: $ip")
                            call.resolve(ret)
                            return
                        }

                        candidates.add(ip)
                    }
                }

                // Use the first candidate (usually wlan0 or similar)
                if (candidates.isNotEmpty()) {
                    val ip = candidates[0]
                    val ret = JSObject()
                    ret.put("ip", ip)
                    android.util.Log.i(TAG, "IP from network interface: $ip")
                    call.resolve(ret)
                    return
                }
            }

            call.reject("No IP address available — connect to WiFi or enable hotspot")
        } catch (e: Exception) {
            call.reject("Failed to get IP: ${e.message}")
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  TRANSFER CONSENT — Bridge between NanoHTTPD and JS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Notify the JS layer about an incoming transfer request.
     * Called by HyperDropHttpServer when a PrepareRequest is received.
     * The HTTP response is held open until respondToTransfer() is called.
     */
    fun notifyIncomingTransfer(data: JSObject) {
        notifyListeners("transferRequest", data)
    }

    /** Notify JS that a file transfer completed. Called by HyperDropHttpServer. */
    fun notifyTransferComplete(data: JSObject) {
        notifyListeners("transferComplete", data)
    }

    /** Notify JS that a chat message was received. Called by HyperDropHttpServer. */
    fun notifyChatMessage(data: JSObject) {
        notifyListeners("chatMessage", data)
    }

    /** Notify JS that clipboard was synced. Called by HyperDropHttpServer. */
    fun notifyClipboardSync(data: JSObject) {
        notifyListeners("clipboardSync", data)
    }

    /**
     * Called from JS to accept or decline a pending transfer.
     */
    @PluginMethod
    fun respondToTransfer(call: PluginCall) {
        val sessionId = call.getString("sessionId") ?: run {
            call.reject("sessionId required"); return
        }
        val accepted = call.getBoolean("accepted") ?: false
        val sessionToken = call.getString("sessionToken") ?: ""
        val reason = call.getString("reason") ?: ""

        httpServer?.handleTransferResponse(sessionId, accepted, sessionToken, reason)
        call.resolve()
    }

    // ═══════════════════════════════════════════════════════════════
    //  LIFECYCLE
    // ═══════════════════════════════════════════════════════════════

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        try {
            httpServer?.stop()
            discoveryThread?.interrupt()
            multicastSocket?.close()
            if (multicastLock?.isHeld == true) multicastLock?.release()
        } catch (_: Exception) { }
        android.util.Log.i(TAG, "Plugin destroyed — all resources released")
    }
}
