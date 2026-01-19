'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

import type { CoverageStats } from '../types/Insights'
import type { Track } from '../types/Track'
import type {
	WorkerRequestMessage,
	WorkerResponseMessage,
	WorkerOptions,
	ContinuousInsightsResultSerializable
} from '../utils/continuous/workerTypes'

export interface InsightsProgress {
	stage: string
	percent: number
	detail?: string
}

export interface ContinuousInsightsResult {
	insights: ContinuousInsightsResultSerializable['insights']
	edges: ContinuousInsightsResultSerializable['edges']
	baselines: ContinuousInsightsResultSerializable['baselines']
	diagnostics: Map<string, { ksStatistic: number; ksPassesAt05: boolean }>
	coverage: CoverageStats
	totalObservedHours: number
	numEvents: number
	numTypes: number
	modelFitted: boolean
}

export interface UseInsightsWorkerReturn {
	result: ContinuousInsightsResult | null
	analyzing: boolean
	progress: InsightsProgress | null
	error: string | null
	analyze: (tracks: Track[], options?: WorkerOptions) => void
	cancel: () => void
}

function convertResult (data: ContinuousInsightsResultSerializable): ContinuousInsightsResult {
	const diagnostics = new Map<string, { ksStatistic: number; ksPassesAt05: boolean }>()
	for (const d of data.diagnostics) {
		diagnostics.set(d.typeName, {
			ksStatistic: d.ksStatistic,
			ksPassesAt05: d.ksPassesAt05
		})
	}

	return {
		insights: data.insights,
		edges: data.edges,
		baselines: data.baselines,
		diagnostics,
		coverage: data.coverage,
		totalObservedHours: data.totalObservedHours,
		numEvents: data.numEvents,
		numTypes: data.numTypes,
		modelFitted: data.modelFitted
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

	const analyze = useCallback((tracks: Track[], options: WorkerOptions = {}) => {
		workerRef.current?.terminate()

		setAnalyzing(true)
		setProgress({ stage: 'Initializing', percent: 0 })
		setError(null)
		setResult(null)

		const worker = new Worker(
			new URL('../utils/continuous/insights.worker.ts', import.meta.url)
		)
		workerRef.current = worker

		worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
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

		const message: WorkerRequestMessage = {
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
