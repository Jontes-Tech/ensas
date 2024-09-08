// /**
//  * Get the avatar URL of a user from ENState
//  * @param name - The name of the user
//  */

type enstateResponse = {
    avatar?: string;
};

import { createClient } from 'redis';

const getRedis = async () => {
    return await createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
    })
        .on('error', (error) => {
            console.error(error);
        })
        .connect();
};

export const getAvatarURL = async (name: string) => {
    try {
        const redis = await getRedis();

        const cached = JSON.parse((await redis.get(name)) || '{}') as {
            avatar: string;
            fresh: number;
        } | null;

        if (!!cached && Date.now() - cached.fresh < 604_800_000) {
            return cached.avatar;
        }

        const response = await fetch(
            `${process.env.ENSTATE_URL || 'https://enstate.rs/n/'}${name}`,
        );

        if (response.status !== 200) {
            throw new Error('Invalid status code');
        }

        const data = (await response.json()) as enstateResponse;

        await redis.set(
            name,
            JSON.stringify({ avatar: data.avatar, fresh: Date.now() }),
        );

        return (data.avatar || '').toString();
    } catch {
        return '';
    }
};
