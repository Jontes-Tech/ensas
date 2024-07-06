// /**
//  * Get the avatar URL of a user from ENState
//  * @param name - The name of the user
//  */

type enstateResponse = {
    avatar?: string;
};

export const getAvatarURL = async (name: string) => {
    try {
        const response = await fetch(
            `${process.env.ENSTATE_URL || 'https://enstate.rs/'}/n/${name}`,
        );

        if (response.status !== 200) {
            throw new Error('Invalid status code');
        }

        const data = (await response.json()) as enstateResponse;

        return (data.avatar || '').toString();
    } catch {
        return '';
    }
};
