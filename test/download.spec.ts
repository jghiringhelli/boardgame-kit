import { describe, it, expect, vi } from 'vitest';
import { downloadText, downloadJson } from '../src/download';

describe('downloadText', () => {
  it('creates a download anchor with the given filename and clicks it', () => {
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() } as unknown as HTMLAnchorElement;
    const createSpy = vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);

    downloadText('report.txt', 'hello world');

    expect(createSpy).toHaveBeenCalledWith('a');
    expect(anchor.download).toBe('report.txt');
    expect(anchor.click).toHaveBeenCalled();
    expect(anchor.remove).toHaveBeenCalled();

    createSpy.mockRestore();
    appendSpy.mockRestore();
  });

  it('does not throw even if the DOM download path is unavailable', () => {
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => downloadText('report.txt', 'hello')).not.toThrow();
    createSpy.mockRestore();
  });
});

describe('downloadJson', () => {
  it('serializes the data as pretty-printed JSON by default', () => {
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() } as unknown as HTMLAnchorElement;
    const captured: { blob: Blob | null } = { blob: null };
    const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { captured.blob = b as Blob; return 'blob:mock'; });
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);

    downloadJson('state.json', { a: 1 });

    expect(anchor.download).toBe('state.json');
    expect(captured.blob?.type).toBe('application/json');

    vi.restoreAllMocks();
    createUrlSpy.mockRestore();
  });
});
