import { sizes } from '../constants';

export const performSanityCheck = (
    size: string | null,
    format: string | null,
) => {
    if (format !== 'webp' && format !== 'jpg') {
        return 'Invalid format';
    }

    if (!sizes.includes(Number.parseInt(size || '-1'))) {
        return 'Invalid size';
    }

    if (format === 'jpg' && size !== '64') {
        return 'Invalid size for jpg';
    }
};
