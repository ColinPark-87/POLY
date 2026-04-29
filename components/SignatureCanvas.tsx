'use client'

import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import SignaturePad from 'signature_pad'

export interface SignatureCanvasHandle {
  getDataURL: () => string | null
  isEmpty: () => boolean
  clear: () => void
}

interface Props {
  width?: number
  height?: number
}

const SignatureCanvas = forwardRef<SignatureCanvasHandle, Props>(
  ({ width = 400, height = 160 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const padRef = useRef<SignaturePad | null>(null)

    useEffect(() => {
      if (!canvasRef.current) return
      padRef.current = new SignaturePad(canvasRef.current, {
        backgroundColor: 'rgb(255,255,255)',
        penColor: 'rgb(30,41,59)',
      })

      const ratio = window.devicePixelRatio || 1
      canvasRef.current.width = width * ratio
      canvasRef.current.height = height * ratio
      canvasRef.current.style.width = `${width}px`
      canvasRef.current.style.height = `${height}px`
      canvasRef.current.getContext('2d')?.scale(ratio, ratio)
      padRef.current.clear()

      return () => { padRef.current?.off() }
    }, [width, height])

    useImperativeHandle(ref, () => ({
      getDataURL: () => padRef.current?.isEmpty() ? null : padRef.current?.toDataURL() ?? null,
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      clear: () => { padRef.current?.clear() },
    }))

    return (
      <div className="border-2 border-dashed border-[#CBD5E1] rounded-xl overflow-hidden bg-white">
        <canvas ref={canvasRef} style={{ touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
        <p className="text-xs text-[#94A3B8] text-center py-2 border-t border-[#E2E8F0]">
          마우스 또는 터치로 서명해 주세요
        </p>
      </div>
    )
  }
)

SignatureCanvas.displayName = 'SignatureCanvas'
export default SignatureCanvas
