/** 字数统计：CJK 字符逐字计数，西文按词计数 */
export function countText(md: string): { words: number; chars: number } {
  const stripped = md
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/[*_~#>[\]()!|`]/g, ' ')
  const cjk = stripped.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g)?.length ?? 0
  const latin = stripped
    .replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ')
    .match(/[A-Za-z0-9][A-Za-z0-9_'’-]*/g)?.length ?? 0
  return { words: cjk + latin, chars: md.length }
}
