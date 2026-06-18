import { formatBytes } from './formatBytes';
import { formatSpeed } from './formatSpeed';
import type { Protocol } from '../store/useStore';

interface FeedbackData {
  rating: number;
  comment?: string;
  fileName: string;
  fileSize: number;
  speed: number;
  protocol: Protocol;
  direction: 'send' | 'receive';
}

/**
 * Submits user rating and speed stats to a Discord Webhook.
 * Fails gracefully and logs to the console if the webhook URL is not configured.
 */
export async function submitFeedbackToDiscord(data: FeedbackData): Promise<boolean> {
  const webhookUrl = import.meta.env.VITE_DISCORD_WEBHOOK_URL;

  // Render a gorgeous console block for local debugging
  console.log(
    `%c[Feedback Received] %c${'★'.repeat(data.rating)}${'☆'.repeat(5 - data.rating)}\n` +
    `File: ${data.fileName} (${formatBytes(data.fileSize)})\n` +
    `Protocol: ${data.protocol} | Speed: ${formatSpeed(data.speed)}\n` +
    `Direction: ${data.direction.toUpperCase()}\n` +
    `Comment: ${data.comment || 'No comment provided.'}`,
    'color: #8b5cf6; font-weight: bold; font-size: 14px;',
    'color: #eab308; font-size: 14px;'
  );

  if (!webhookUrl) {
    console.warn('[Feedback] Discord Webhook URL is not configured (VITE_DISCORD_WEBHOOK_URL is missing).');
    return false;
  }

  try {
    const starLabel = '★'.repeat(data.rating) + '☆'.repeat(5 - data.rating);
    const color = data.rating >= 4 ? 0x10b981 : data.rating >= 3 ? 0xf59e0b : 0xef4444; // green, orange, red

    const embed = {
      title: '⚡ HyperDrop Transfer Feedback',
      description: data.comment ? `"${data.comment}"` : '*No written comments.*',
      color: color,
      fields: [
        {
          name: 'Rating',
          value: `**${data.rating} / 5** (${starLabel})`,
          inline: true,
        },
        {
          name: 'Direction',
          value: data.direction === 'send' ? '📤 Sender' : '📥 Receiver',
          inline: true,
        },
        {
          name: 'Protocol',
          value: `\`${data.protocol}\``,
          inline: true,
        },
        {
          name: 'File Name',
          value: data.fileName,
          inline: false,
        },
        {
          name: 'File Size',
          value: formatBytes(data.fileSize),
          inline: true,
        },
        {
          name: 'Average Speed',
          value: formatSpeed(data.speed),
          inline: true,
        },
        {
          name: 'Platform',
          value: navigator.userAgent.includes('Mobile') ? '📱 Mobile Browser' : '💻 Desktop Browser',
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'HyperDrop Premium Analytics',
      },
    };

    const payload = {
      embeds: [embed],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Discord Webhook responded with status: ${response.status}`);
    }

    console.log('[Feedback] Successfully pushed rating to Discord Webhook!');
    return true;
  } catch (error) {
    console.error('[Feedback] Failed to send feedback to Discord:', error);
    return false;
  }
}
