'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

import type { CoverageStats } from '../types/Insights'
import type { Track } from '../types/Track'
import type {
	WorkerRequestMessageV2,
	WorkerResponseMessageV2,
	WorkerOptionsV2,
	ContinuousInsightsResultSerializable
} from '../utils/continuous_v2/workerTypes'

export interface InsightsProgress {
	stage: string
	percent: number
	detail?: string
}

export interface ContinuousInsightsResult {
	insights: ContinuousInsightsResultSerializable['insights']
	edges: ContinuousInsightsResultSerializable['edges']
	baselines: ContinuousInsightsResultSerializable['baselines']
	motifs: ContinuousInsightsResultSerializable['motifs']
	diagnostics: Map<string, { calibrationError: number }>
	validation: ContinuousInsightsResultSerializable['validation']
	coverage: CoverageStats
	totalObservedHours: number
	numEvents: number
	numTypes: number
	numBins: number
	numRegimes: number
	modelFitted: boolean
	converged: boolean
	trainLogLik: number[]
}

export interface UseInsightsWorkerReturn {
	result: ContinuousInsightsResult | null
	analyzing: boolean
	progress: InsightsProgress | null
	error: string | null
	analyze: (tracks: Track[], options?: WorkerOptionsV2) => void
	cancel: () => void
}

function convertResult (data: ContinuousInsightsResultSerializable): ContinuousInsightsResult {
	const diagnostics = new Map<string, { calibrationError: number }>()
	for (const d of data.diagnostics) {
		diagnostics.set(d.typeName, {
			calibrationError: d.calibrationError
		})
	}

	return {
		insights: data.insights,
		edges: data.edges,
		baselines: data.baselines,
		motifs: data.motifs,
		diagnostics,
		validation: data.validation,
		coverage: data.coverage,
		totalObservedHours: data.totalObservedHours,
		numEvents: data.numEvents,
		numTypes: data.numTypes,
		numBins: data.numBins,
		numRegimes: data.numRegimes,
		modelFitted: data.modelFitted,
		converged: data.converged,
		trainLogLik: data.trainLogLik
	}
}

export function useInsightsWorker (): UseInsightsWorkerReturn {
	const [result, setResult] = useState<ContinuousInsightsResult | null>(null)
	const [analyzing, setAnalyzing] = useState(false)
	const [progress, setProgress] = useState<InsightsProgress | null>(null)
	const [error, setError] = useState<string | null>(null)
	const workerRef = useRef<Worker | null>(null)

	useEffect(() => {
		return () => {
			workerRef.current?.terminate()
			workerRef.current = null
		}
	}, [])

	const analyze = useCallback((tracks: Track[], options: WorkerOptionsV2 = {}) => {
		workerRef.current?.terminate()

		setAnalyzing(true)
		setProgress({ stage: 'Initializing', percent: 0 })
		setError(null)
		setResult(null)

		const worker = new Worker(
			new URL('../utils/continuous_v2/insights.worker.ts', import.meta.url)
		)
		workerRef.current = worker

		worker.onmessage = (event: MessageEvent<WorkerResponseMessageV2>) => {
			const msg = event.data

			switch (msg.type) {
				case 'progress':
					setProgress({
						stage: msg.stage,
						percent: msg.percent,
						detail: msg.detail
					})
					break

				case 'result':
					setResult(convertResult(msg.data))
					setAnalyzing(false)
					setProgress(null)
					worker.terminate()
					workerRef.current = null
					break

				case 'error':
					setError(msg.message)
					setAnalyzing(false)
					setProgress(null)
					worker.terminate()
					workerRef.current = null
					break
			}
		}

		worker.onerror = (event) => {
			setError(event.message || 'Worker error')
			setAnalyzing(false)
			setProgress(null)
			worker.terminate()
			workerRef.current = null
		}

		const message: WorkerRequestMessageV2 = {
			type: 'start',
			tracks,
			options
		}
		worker.postMessage(message)
	}, [])

	const cancel = useCallback(() => {
		workerRef.current?.terminate()
		workerRef.current = null
		setAnalyzing(false)
		setProgress(null)
	}, [])

	return {
		result,
		analyzing,
		progress,
		error,
		analyze,
		cancel
	}
}
