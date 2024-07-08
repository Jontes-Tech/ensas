import { resizeAndUpload } from './resizeAndUpload';

export const populateCache = async (
    fileURL: string,
    age: number,
) => {
    // If the file is older than 5 days, fetch it again
    if (age > 1000 * 60 * 60 * 24 * 5 || age === 0) {
        resizeAndUpload(fileURL);
    }
};
