# Admin Charter Comment Side Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/champions/[userId]` 상세 페이지의 과제정의서 섹션을 2-column 레이아웃으로 변경해 우측에 sticky 코멘트 패널을 배치한다.

**Architecture:** 기존 `AdminChampionPage` 컴포넌트의 JSX 구조만 변경한다. 상태 관리(`charterComments`, `newCharterComment`, `postingCharter`) 및 핸들러(`postCharterComment`, `loadCharterComments`)는 그대로 유지. 과제정의서 섹션의 `flex flex-col gap-3` 컨테이너를 `flex gap-6 items-start`로 바꾸고, 기존 코멘트 박스를 우측 sticky 패널로 분리한다.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS variables (인라인 style 패턴 유지)

## Global Constraints

- CSS: CSS variable 기반 인라인 style 객체 사용 (기존 패턴 그대로)
- 새 외부 라이브러리 없음
- 기존 로직(state, handlers, API 호출) 변경 없음
- 커밋 메시지 형식: `[AX-1] feat(scope): description`

---

### Task 1: 과제정의서 섹션 2-column 레이아웃으로 변경

**Files:**
- Modify: `app/admin/champions/[userId]/page.tsx` (lines 517–637)

**Interfaces:**
- Consumes: 기존 state — `charterComments`, `newCharterComment`, `postingCharter`, `postCharterComment`
- Produces: 시각적으로 좌(과제정의서 내용) + 우(sticky 코멘트 패널) 2-column 레이아웃

- [ ] **Step 1: 현재 과제정의서 섹션 JSX 확인**

`app/admin/champions/[userId]/page.tsx` line 517 부터 638 에 걸쳐 있는 `{data.charter && (...)}` 블록을 확인한다.

현재 구조:
```tsx
{data.charter && (
  <section id="charter" className="mb-8">
    <div className="flex items-center gap-3 mb-3">
      {/* 헤더: 제목 + 승인 버튼 */}
    </div>
    <div className="flex flex-col gap-3">
      {/* 00~07 charter sections (CHARTER_SECTIONS.map + Timeline + Closing) */}
      {/* 과제정의서 코멘트 박스 (맨 아래) */}
    </div>
  </section>
)}
```

- [ ] **Step 2: 2-column 레이아웃으로 교체**

`{data.charter && (...)}` 블록 전체를 아래 JSX로 교체한다.

변경 전 (line 517–638):
```tsx
      {data.charter && (
        <section id="charter" className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>과제정의서</h2>
            {data.charter.admin_approved_at ? (
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(22,163,74,0.12)', color: 'var(--success)', border: '1px solid rgba(22,163,74,0.3)' }}
              >
                ✓ 승인됨 · {new Date(data.charter.admin_approved_at).toLocaleDateString('ko-KR')}
              </span>
            ) : (
              <button
                onClick={() => approveCharter(data.charter!.id)}
                disabled={approving}
                className="text-xs font-semibold px-3 py-1 rounded-full disabled:opacity-50"
                style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', border: '1px solid rgba(37,99,235,0.3)', cursor: 'pointer' }}
              >
                {approving ? '처리 중…' : '✓ 승인'}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {/* 00–05 Text sections */}
            {CHARTER_SECTIONS.map(s => {
              const html = data.charter!.content?.[s.key as keyof CharterSubmission['content']]
              if (!html) return null
              return (
                <div key={s.key} className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
                  <div className="charter-editor">
                    <div className="ProseMirror" style={{ padding: 0, fontSize: '0.8125rem', lineHeight: 1.65, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: html }} />
                  </div>
                </div>
              )
            })}

            {/* 06. Timeline · Milestones */}
            <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>06. Timeline · Milestones</p>
              {(data.milestones ?? []).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {buildTree(data.milestones ?? []).map(m => (
                    <MilestoneRow key={m.id} m={m as Milestone & { children?: Milestone[] }} depth={0} />
                  ))}
                </div>
              ) : (
                <p className="text-xs italic" style={{ color: 'var(--text-disabled)', margin: 0 }}>(마일스톤 없음)</p>
              )}
            </div>

            {/* 07. 마무리 */}
            <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>07. Closing · 마무리</p>
              {data.charter!.content.closing ? (
                <div className="charter-editor">
                  <div className="ProseMirror" style={{ padding: 0, fontSize: '0.8125rem', lineHeight: 1.65, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: data.charter!.content.closing }} />
                </div>
              ) : (
                <p className="text-xs italic" style={{ color: 'var(--text-disabled)', margin: 0 }}>(내용 없음)</p>
              )}
            </div>

            {/* 과제정의서 코멘트 */}
            <div className="rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  과제정의서 코멘트 {charterComments.length > 0 ? `(${charterComments.length})` : ''}
                </p>
              </div>
              <div className="p-3 flex flex-col gap-2">
                {charterComments.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-1">
                    {charterComments.map(c => (
                      <div
                        key={c.id}
                        className="rounded-md border p-2 text-xs"
                        style={{
                          background: c.author_role === 'admin' ? 'rgba(37,99,235,0.04)' : 'var(--surface-secondary)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex justify-between mb-0.5">
                          <span className="font-semibold" style={{ color: c.author_role === 'admin' ? 'var(--blue-600)' : 'var(--text-primary)' }}>
                            {c.author_role === 'admin' ? '관리자' : '챔피언'}
                          </span>
                          <span style={{ color: 'var(--text-disabled)' }}>{relativeTime(c.created_at)}</span>
                        </div>
                        <p className="whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{c.body}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <textarea
                    value={newCharterComment}
                    onChange={e => setNewCharterComment(e.target.value)}
                    onKeyDown={e => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault()
                        postCharterComment()
                      }
                    }}
                    placeholder="과제정의서에 대한 코멘트 작성 (Cmd+Enter)"
                    rows={2}
                    className="flex-1 text-xs rounded-md border p-2 resize-none"
                    style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <button
                    onClick={postCharterComment}
                    disabled={postingCharter || !newCharterComment.trim()}
                    className="text-xs inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-semibold disabled:opacity-40 self-end"
                    style={{ background: 'var(--blue-600)', color: '#fff', cursor: 'pointer', border: 'none' }}
                  >
                    {postingCharter ? <Spinner size="sm" /> : <Send className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
```

변경 후:
```tsx
      {data.charter && (
        <section id="charter" className="mb-8">
          {/* 헤더: 제목 + 승인 버튼 */}
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>과제정의서</h2>
            {data.charter.admin_approved_at ? (
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(22,163,74,0.12)', color: 'var(--success)', border: '1px solid rgba(22,163,74,0.3)' }}
              >
                ✓ 승인됨 · {new Date(data.charter.admin_approved_at).toLocaleDateString('ko-KR')}
              </span>
            ) : (
              <button
                onClick={() => approveCharter(data.charter!.id)}
                disabled={approving}
                className="text-xs font-semibold px-3 py-1 rounded-full disabled:opacity-50"
                style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', border: '1px solid rgba(37,99,235,0.3)', cursor: 'pointer' }}
              >
                {approving ? '처리 중…' : '✓ 승인'}
              </button>
            )}
          </div>

          {/* 2-column: 좌(과제정의서) + 우(코멘트 패널) */}
          <div className="flex gap-6 items-start">

            {/* 좌측: 과제정의서 내용 */}
            <div className="flex flex-col gap-3 flex-1 min-w-0">
              {/* 00–05 Text sections */}
              {CHARTER_SECTIONS.map(s => {
                const html = data.charter!.content?.[s.key as keyof CharterSubmission['content']]
                if (!html) return null
                return (
                  <div key={s.key} className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
                    <div className="charter-editor">
                      <div className="ProseMirror" style={{ padding: 0, fontSize: '0.8125rem', lineHeight: 1.65, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: html }} />
                    </div>
                  </div>
                )
              })}

              {/* 06. Timeline · Milestones */}
              <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
                <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>06. Timeline · Milestones</p>
                {(data.milestones ?? []).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {buildTree(data.milestones ?? []).map(m => (
                      <MilestoneRow key={m.id} m={m as Milestone & { children?: Milestone[] }} depth={0} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic" style={{ color: 'var(--text-disabled)', margin: 0 }}>(마일스톤 없음)</p>
                )}
              </div>

              {/* 07. 마무리 */}
              <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>07. Closing · 마무리</p>
                {data.charter!.content.closing ? (
                  <div className="charter-editor">
                    <div className="ProseMirror" style={{ padding: 0, fontSize: '0.8125rem', lineHeight: 1.65, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: data.charter!.content.closing }} />
                  </div>
                ) : (
                  <p className="text-xs italic" style={{ color: 'var(--text-disabled)', margin: 0 }}>(내용 없음)</p>
                )}
              </div>
            </div>

            {/* 우측: sticky 코멘트 패널 */}
            <div
              style={{
                width: 300,
                flexShrink: 0,
                position: 'sticky',
                top: 80,
                maxHeight: 'calc(100vh - 120px)',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 12,
                border: '1px solid var(--border-subtle)',
                background: 'var(--surface-primary)',
                overflow: 'hidden',
              }}
            >
              {/* 패널 헤더 */}
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  flexShrink: 0,
                }}
              >
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  코멘트 {charterComments.length > 0 ? `(${charterComments.length})` : ''}
                </p>
              </div>

              {/* 코멘트 목록 (스크롤) */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {charterComments.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--text-disabled)', textAlign: 'center', padding: '16px 0' }}>
                    아직 코멘트가 없습니다
                  </p>
                ) : (
                  charterComments.map(c => (
                    <div
                      key={c.id}
                      className="rounded-md border p-2 text-xs"
                      style={{
                        background: c.author_role === 'admin' ? 'rgba(37,99,235,0.04)' : 'var(--surface-secondary)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex justify-between mb-0.5">
                        <span className="font-semibold" style={{ color: c.author_role === 'admin' ? 'var(--blue-600)' : 'var(--text-primary)' }}>
                          {c.author_role === 'admin' ? '관리자' : '챔피언'}
                        </span>
                        <span style={{ color: 'var(--text-disabled)' }}>{relativeTime(c.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{c.body}</p>
                    </div>
                  ))
                )}
              </div>

              {/* 입력창 (하단 고정) */}
              <div
                style={{
                  padding: '12px',
                  borderTop: '1px solid var(--border-subtle)',
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <textarea
                  value={newCharterComment}
                  onChange={e => setNewCharterComment(e.target.value)}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault()
                      postCharterComment()
                    }
                  }}
                  placeholder="코멘트 작성 (Cmd+Enter)"
                  rows={3}
                  className="w-full text-xs rounded-md border p-2 resize-none"
                  style={{
                    background: 'var(--surface-secondary)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={postCharterComment}
                  disabled={postingCharter || !newCharterComment.trim()}
                  className="w-full text-xs inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 font-semibold disabled:opacity-40"
                  style={{ background: 'var(--blue-600)', color: '#fff', cursor: 'pointer', border: 'none' }}
                >
                  {postingCharter ? <Spinner size="sm" /> : <Send className="h-3 w-3" />}
                  {postingCharter ? '전송 중…' : '코멘트 작성'}
                </button>
              </div>
            </div>

          </div>
        </section>
      )}
```

- [ ] **Step 3: TypeScript 에러 확인**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | head -20
```
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add app/admin/champions/\[userId\]/page.tsx
git commit -m "[AX-1] feat: 과제정의서 코멘트를 sticky 사이드 패널로 개편"
```
