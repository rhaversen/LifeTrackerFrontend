'use client'

import axios from 'axios'
import { useState, useEffect, useCallback, type ReactElement } from 'react'

import { useInsightsWorker } from '../hooks/useInsightsWorker'
import type { Track } from '../types/Track'

import ActivityCalendar from './ActivityCalendar'
import { CoverageCard, InfluenceEdgeCard, BaselineRhythmCard } from './InsightCards'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

interface ProgressBarProps {
	percent: number
	stage: string
	detail?: string
}

function ProgressBar ({ percent, stage, detail }: ProgressBarProps): ReactElement {
	return (
		<div className="w-full max-w-md mx-auto">
			<div className="flex justify-between text-sm mb-2">
				<span className="text-gray-300">{stage}</span>
				<span className="text-gray-400">{`${percent}%`}</span>
			</div>
			<div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
				<div
					className="bg-linear-to-r from-blue-500 to-blue-400 h-full rounded-full transition-all duration-300 ease-out"
					style={{ width: `${percent}%` }}
				/>
			</div>
			{detail !== undefined && detail !== '' && (
				<div className="text-xs text-gray-500 mt-2 text-center">{detail}</div>
			)}
		</div>
	)
}

export default function InsightsTab (): ReactElement {
	const [tracks, setTracks] = useState<Track[]>([])
	const [loading, setLoading] = useState(true)

	const { result: continuousResult, analyzing, progress, error, analyze, cancel } = useInsightsWorker()

	const fetchTracks = useCallback(async (): Promise<void> => {
		setLoading(true)
		try {
			const response = await axios.get<Track[]>(`${API_URL}/v1/tracks`, {
				withCredentials: true
			})
			setTracks(response.data)
		} catch (err) {
			console.error('Failed to fetch tracks:', err)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchTracks().catch(console.error)
	}, [fetchTracks])

	useEffect(() => {
		if (tracks.length === 0) {
			return
		}

		analyze(tracks)

		return () => {
			cancel()
		}
	}, [tracks, analyze, cancel])

	if (loading) {
		return (
			<div className="flex items-center justify-center py-20">
				<div className="text-gray-300 text-xl">{'Loading tracks...'}</div>
			</div>
		)
	}

	if (tracks.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-20 text-center">
				<div className="text-gray-400 text-xl mb-2">{'No data to analyze'}</div>
				<div className="text-gray-500">{'Add some tracks to discover patterns'}</div>
			</div>
		)
	}

	if (analyzing && progress) {
		return (
			<div className="space-y-6">
				<h2 className="text-2xl font-bold text-gray-200">{'Insights'}</h2>
				<div className="py-10">
					<div className="text-center mb-6">
						<div className="text-gray-400 mb-2">{'Fitting continuous-time point process model'}</div>
					</div>
					<ProgressBar
						percent={progress.percent}
						stage={progress.stage}
						detail={progress.detail}
					/>
				</div>
			</div>
		)
	}

	if (error !== null && error !== '') {
		return (
			<div className="space-y-6">
				<h2 className="text-2xl font-bold text-gray-200">{'Insights'}</h2>
				<div className="text-center py-10">
					<div className="text-red-400">{'Analysis failed'}</div>
					<div className="text-gray-500 text-sm mt-1">{error}</div>
					<button
						onClick={() => analyze(tracks)}
						className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
					>
						{'Retry'}
					</button>
				</div>
			</div>
		)
	}

	if (continuousResult === null || !continuousResult.modelFitted) {
		return (
			<div className="space-y-6">
				<h2 className="text-2xl font-bold text-gray-200">{'Insights'}</h2>
				<div className="text-center py-10">
					<div className="text-gray-400">{'Insufficient data for continuous analysis'}</div>
					<div className="text-gray-500 text-sm mt-1">
						{'Need at least 50 events and 2 different event types'}
					</div>
				</div>
			</div>
		)
	}

	const influenceEdges = continuousResult.edges.filter(e => e.direction !== 'neutral')
	const excitingEdges = influenceEdges.filter(e => e.direction === 'excite')
	const inhibitingEdges = influenceEdges.filter(e => e.direction === 'inhibit')
	const rhythmicBaselines = continuousResult.baselines.filter(b => b.hourAmplitude > 0.3 || b.dowAmplitude > 0.2)

	return (
		<div className="space-y-6">
			<h2 className="text-2xl font-bold text-gray-200">{'Insights'}</h2>

			<div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
				<ActivityCalendar tracks={tracks} coverage={continuousResult.coverage} />
			</div>

			<CoverageCard coverage={continuousResult.coverage} />

			{excitingEdges.length > 0 && (
				<div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
					<div className="flex items-center gap-2 mb-3">
						<span className="text-lg">{'⚡'}</span>
						<span className="text-sm font-medium text-orange-400">{'Excitatory Influences'}</span>
						<span className="text-xs text-gray-500">{`${excitingEdges.length} edges`}</span>
					</div>
					<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{excitingEdges.slice(0, 9).map((edge, idx) => (
							<InfluenceEdgeCard key={`exc-${idx}`} edge={edge} />
						))}
					</div>
				</div>
			)}

			{inhibitingEdges.length > 0 && (
				<div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
					<div className="flex items-center gap-2 mb-3">
						<span className="text-lg">{'🛑'}</span>
						<span className="text-sm font-medium text-purple-400">{'Inhibitory Influences'}</span>
						<span className="text-xs text-gray-500">{`${inhibitingEdges.length} edges`}</span>
					</div>
					<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{inhibitingEdges.slice(0, 9).map((edge, idx) => (
							<InfluenceEdgeCard key={`inh-${idx}`} edge={edge} />
						))}
					</div>
				</div>
			)}

			{rhythmicBaselines.length > 0 && (
				<div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
					<div className="flex items-center gap-2 mb-3">
						<span className="text-lg">{'🔄'}</span>
						<span className="text-sm font-medium text-blue-400">{'Rhythms'}</span>
						<span className="text-xs text-gray-500">{'time-of-day & weekly patterns'}</span>
					</div>
					<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
						{rhythmicBaselines.map((baseline, idx) => (
							<BaselineRhythmCard key={`rhythm-${idx}`} baseline={baseline} />
						))}
					</div>
				</div>
			)}

			<div className="text-xs text-gray-600 text-center pt-4 border-t border-gray-800">
				{`Point process model: ${tracks.length} events • ${continuousResult.numTypes} types • ${continuousResult.totalObservedHours.toFixed(0)} observed hours • Exponential basis kernels`}
			</div>
		</div>
	)
}
