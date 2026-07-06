'use client'
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export interface ConfirmOptions {
  title?: string
  description: string
  confirmText?: string
  cancelText?: string
  /** 위험(삭제 등) 액션이면 확인 버튼을 강조색(빨강)으로. */
  destructive?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * window.confirm 을 앱 표준 AlertDialog 로 대체하는 promise 기반 훅.
 *
 *   const confirm = useConfirm()
 *   if (!(await confirm({ description: '삭제할까요?', destructive: true }))) return
 *
 * 제어 흐름이 window.confirm 과 동일해 호출부를 거의 그대로 교체할 수 있다.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>')
  return ctx
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value)
    resolverRef.current = null
    setOpen(false)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          // 바깥 클릭/ESC 로 닫히면 취소로 처리
          if (!next) settle(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title ?? '확인'}</AlertDialogTitle>
            <AlertDialogDescription>{opts?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {opts?.cancelText ?? '취소'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              style={opts?.destructive ? { background: 'var(--error)', color: '#fff' } : undefined}
            >
              {opts?.confirmText ?? '확인'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
