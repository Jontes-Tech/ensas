import mq from 'amqplib/callback_api';

let channel: mq.Channel | null = null;

const connectRabbitMQ = () => {
  mq.connect(process.env.AMQP || "amqp://localhost", (err, conn) => {
    if (err) throw err;
    conn.createChannel((err, ch) => {
      if (err) throw err;
      ch.assertQueue('ensas_queue');
      channel = ch;
    });
  });
}

export const getChannel = () => {
  if (!channel) {
    connectRabbitMQ();
  }
  return channel;
}

export const resizeAndUpload = async (file: string) => {
    getChannel()?.sendToQueue('ensas_queue', Buffer.from(file));
}