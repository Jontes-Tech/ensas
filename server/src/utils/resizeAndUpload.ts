import mq from 'amqplib/callback_api';

let channel: mq.Channel | null = null;

const connectRabbitMQ = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    mq.connect(process.env.AMQP || "amqp://localhost", (err, conn) => {
      if (err) reject(err);
      conn.createChannel((err, ch) => {
        if (err) reject(err);
        ch.assertQueue('ensas_queue');
        channel = ch;
        resolve();
      });
    });
  });
}

export const getChannel = async (): Promise<mq.Channel | null> => {
  if (!channel) {
    await connectRabbitMQ();
  }
  return channel;
}

export const resizeAndUpload = async (file: string) => {
    const channel = await getChannel();
    channel?.sendToQueue('ensas_queue', Buffer.from(file));
}