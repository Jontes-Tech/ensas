import { Response } from 'express';

export const userError = (response: Response, size: number) => {
    try {
        response.setHeader('Content-Type', 'image/svg+xml');
        response.send(`<?xml version="1.0" standalone="no"?>
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" height="${size}px" width="${size}px">
    <defs>
    <linearGradient id="0" x1="0.66" y1="0.03" x2="0.34" y2="0.97">
    <stop offset="1%" stop-color="#5298ff"/>
    <stop offset="51%" stop-color="#5298ff"/>
    <stop offset="100%" stop-color="#5298ff"/>
    </linearGradient>
    </defs>
    <rect fill="url(#0)" height="100%" width="100%"/>
    </svg>`);
    } catch (error) {
        console.error('Error while sending error', error);
    }
};
