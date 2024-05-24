/* eslint-disable sonarjs/no-duplicate-string */
import { expect, test } from 'bun:test';

import { handleNotFound } from '../src/utils/getImage';

test('E2E IPFS ethname', async () => {
    const response = await fetch('http://localhost:3000/64/jontes.eth.webp');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(await response.arrayBuffer()).toBeTruthy();
});

test('E2E ENS name without avatar', async () => {
    const response = await fetch('http://localhost:3000/64/noavatar.eth.webp');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
        'image/svg+xml; charset=utf-8',
    );
    expect(await response.text()).toBeTruthy();
});

test('Huge Image', async () => {
    const response = await handleNotFound(
        'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x21600x21600.A2.png',
        64,
        'webp',
    );

    expect(response?.originalBuffer).toBeFalsy();
});

test('Successful Image', async () => {
    const response = await handleNotFound(
        'https://jontes.page/images/avatar.webp',
        64,
        'webp',
    );

    expect(response?.originalBuffer).toBeTruthy();
});
