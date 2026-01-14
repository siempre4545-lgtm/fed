/**
 * H.4.1 Fetch Unit Tests
 * fetchH41HtmlStrict 함수 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchH41HtmlStrict, FetchH41Error } from '../lib/h41-fetch';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('fetchH41HtmlStrict', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should validate and return valid H.4.1 HTML', async () => {
    const validHtml = `
      <html>
        <body>
          <h1>H.4.1 Factors Affecting Reserve Balances</h1>
          <p>Reserve Bank credit information</p>
          <table>
            <tr><th>Consolidated Statement of Condition</th></tr>
          </table>
        </body>
      </html>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => validHtml,
    });

    const result = await fetchH41HtmlStrict('2026-01-08');

    expect(result.html).toBe(validHtml);
    expect(result.url).toContain('20260108');
    expect(result.fetchedAt).toBeDefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should reject HTML with only government banner', async () => {
    const invalidHtml = `
      <html>
        <body>
          <p>An official website of the United States Government</p>
          <p>Here's how you know</p>
        </body>
      </html>
    `;

    // 1차 시도
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => invalidHtml,
    });

    // 2차 시도
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => invalidHtml,
    });

    // 3차 시도: 메인 페이지
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<a href="/releases/h41/20260108/">Link</a>',
    });

    await expect(fetchH41HtmlStrict('2026-01-08')).rejects.toThrow(FetchH41Error);
    
    // 재설정 후 다시 테스트
    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => invalidHtml,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => invalidHtml,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<a href="/releases/h41/20260108/">Link</a>',
    });
    
    try {
      await fetchH41HtmlStrict('2026-01-08');
      expect.fail('Should have thrown FetchH41Error');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchH41Error);
      if (error instanceof FetchH41Error) {
        expect(error.code).toBe('FETCH_BLOCKED_OR_UNEXPECTED_HTML');
      }
    }
  });

  it('should throw NO_RELEASE_FOR_DATE when date link not found', async () => {
    const invalidHtml = `
      <html>
        <body>
          <p>An official website of the United States Government</p>
        </body>
      </html>
    `;

    // 1차 시도
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => invalidHtml,
    });

    // 2차 시도
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => invalidHtml,
    });

    // 3차 시도: 메인 페이지 (날짜 링크 없음)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html><body>No date link here</body></html>',
    });

    try {
      await fetchH41HtmlStrict('2026-01-08');
      expect.fail('Should have thrown FetchH41Error');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchH41Error);
      if (error instanceof FetchH41Error) {
        expect(error.code).toBe('NO_RELEASE_FOR_DATE');
      }
    }
  });

  it('should throw HTTP_ERROR when status is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    try {
      await fetchH41HtmlStrict('2026-01-08');
      expect.fail('Should have thrown FetchH41Error');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchH41Error);
      if (error instanceof FetchH41Error) {
        expect(error.code).toBe('HTTP_ERROR_404');
      }
    }
  });

  it('should validate HTML with at least 2 keywords', async () => {
    const htmlWith2Keywords = `
      <html>
        <body>
          <h1>H.4.1</h1>
          <p>Factors Affecting Reserve Balances</p>
        </body>
      </html>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => htmlWith2Keywords,
    });

    const result = await fetchH41HtmlStrict('2026-01-08');
    expect(result.html).toBe(htmlWith2Keywords);
  });

  it('should reject HTML with only 1 keyword', async () => {
    const htmlWith1Keyword = `
      <html>
        <body>
          <h1>H.4.1</h1>
          <p>Some other content</p>
        </body>
      </html>
    `;

    // 1차 시도
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => htmlWith1Keyword,
    });

    // 2차 시도
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => htmlWith1Keyword,
    });

    // 3차 시도: 메인 페이지
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<a href="/releases/h41/20260108/">Link</a>',
    });

    await expect(fetchH41HtmlStrict('2026-01-08')).rejects.toThrow(FetchH41Error);
  });
});
