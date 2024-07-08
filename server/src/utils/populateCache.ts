import { resizeAndUpload } from './resizeAndUpload';

export const populateCache = async (
    fileURL: string,
    age: number,
) => {
    if (age > 1000 * 60 * 60 * 24 * 5 || age === 0) {
        resizeAndUpload(fileURL);
    }
};
