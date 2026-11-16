export interface OutlineItem {
  level: number
  text: string
  line: number
}

/** 从 markdown 文本提取标题大纲（跳过 front matter 与代码块） */
export function extractOutline(md: string): OutlineItem[] {
  const items: OutlineItem[] = []
  const lines = md.split('\n')
  let start = 0

  // YAML front matter
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        start = i + 1
        break
      }
    }
  }

  let inFence = false
  for (let i = start; i < lines.length; i++) {
    const ln = lines[i]
    if (/^\s*(?:```|~~~)/.test(ln)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = ln.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (m) {
      items.push({
        level: m[1].length,
        text: m[2].replace(/[*_~`]/g, '').trim(),
        line: i,
      })
    }
  }
  return items
}
