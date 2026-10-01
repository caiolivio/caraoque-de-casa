import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractVideoId, formatIsoDuration, parseSearchPage } from '../server/youtube.js';

test('reconhece links do YouTube', () => {
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://youtu.be/dQw4w9WgXcQ?t=10'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('youtube.com/watch?feature=share&v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://m.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('evidências chitãozinho'), null);
});

test('formata duração ISO 8601', () => {
  assert.equal(formatIsoDuration('PT4M5S'), '4:05');
  assert.equal(formatIsoDuration('PT1H2M3S'), '1:02:03');
  assert.equal(formatIsoDuration('PT45S'), '0:45');
  assert.equal(formatIsoDuration(undefined), '');
});

test('lê resultados da página de busca e ignora lives', () => {
  const data = {
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: {
          sectionListRenderer: {
            contents: [
              {
                itemSectionRenderer: {
                  contents: [
                    { videoRenderer: { videoId: 'aaaaaaaaaaa', title: { runs: [{ text: 'Evidências ' }, { text: '(Karaokê)' }] }, ownerText: { runs: [{ text: 'Canal' }] }, lengthText: { simpleText: '4:31' } } },
                    { videoRenderer: { videoId: 'bbbbbbbbbbb', title: { runs: [{ text: 'Live' }] } } },
                    { adSlotRenderer: {} },
                  ],
                },
              },
            ],
          },
        },
      },
    },
  };
  const html = `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`;
  assert.deepEqual(parseSearchPage(html), [
    { videoId: 'aaaaaaaaaaa', title: 'Evidências (Karaokê)', channel: 'Canal', duration: '4:31' },
  ]);
  assert.equal(parseSearchPage('<html>nada</html>'), null);
});
