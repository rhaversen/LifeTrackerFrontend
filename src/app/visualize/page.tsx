'use client'

import axios from 'axios'
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'

import {
	DeltaByTimeScatter,
	HeatmapChart,
	LineScatterChart,
	PolarChart,
	TimeOfDayScatter,
	WeekdayScatter
} from '@/components/charts/Charts'
import {
	useCumulativeData,
	useDeltaByTimeData,
	useDeltaDaysData,
	useFrequencyData,
	useHourlyDistribution,
	useProcessedTracks,
	useTimeOfDayData,
	useWeekdayDistribution,
	useWeekdayHeatmapData,
	useWeekdayScatterData
} from '@/hooks/useTrackData'
import type { Track } from '@/types/Track'

const API_URL = process.env.NEXT_PUBLIC_API_URL

export default function Page (): ReactElement {
	const [tracks, setTracks] = useState<Track[]>([])
	const [selectedTrackName, setSelectedTrackName] = useState<string>('')
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		const fetchData = async (): Promise<void> => {
			try {
				const response = await axios.get<Track[]>(`${API_URL}/v1/tracks`, { withCredentials: true })
				setTracks(response.data)
				const trackNames = [...new Set(response.data.map(t => t.trackName))]
				if (trackNames.length > 0 && !selectedTrackName) {
					setSelectedTrackName(trackNames[0])
				}
			} catch (error) {
				console.error('Failed to fetch tracking data:', error)
			} finally {
				setLoading(false)
			}
		}

		fetchData().catch(console.error)
	}, [selectedTrackName])

	const trackNames = useMemo(() => [...new Set(tracks.map(t => t.trackName))].sort(), [tracks])

	const filteredTracks = useMemo(() =>
		tracks.filter(t => t.trackName === selectedTrackName),
	[tracks, selectedTrackName])

	const processedTracks = useProcessedTracks(filteredTracks)
	const cumulativeData = useCumulativeData(processedTracks)
	const deltaDaysData = useDeltaDaysData(processedTracks)
	const frequencyData = useFrequencyData(processedTracks)
	const timeOfDayData = useTimeOfDayData(processedTracks)
	const hourlyDistribution = useHourlyDistribution(processedTracks)
	const weekdayScatterData = useWeekdayScatterData(processedTracks)
	const weekdayDistribution = useWeekdayDistribution(processedTracks)
	const weekdayHeatmapData = useWeekdayHeatmapData(processedTracks)
	const deltaByTimeData = useDeltaByTimeData(processedTracks)

	const handleTrackChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
		setSelectedTrackName(e.target.value)
	}, [])

	if (loading) {
		return (
			<div className="min-h-screen bg-gray-900 flex items-center justify-center">
				<div className="text-gray-300 text-xl">{'Loading...'}</div>
			</div>
		)
	}

	return (
		<div className="min-h-screen bg-gray-900">
			<header className="sticky top-0 z-10 bg-gray-800 border-b border-gray-700 px-6 py-4">
				<div className="max-w-7xl mx-auto flex items-center justify-between">
					<h1 className="text-2xl font-bold text-white">{'Track Visualizations'}</h1>
					<div className="flex items-center gap-4">
						<label htmlFor="trackSelect" className="text-gray-300">{'Track Type:'}</label>
						<select
							id="trackSelect"
							value={selectedTrackName}
							onChange={handleTrackChange}
							className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							{trackNames.map(name => (
								<option key={name} value={name}>{name}</option>
							))}
						</select>
						<div className="text-gray-400 text-sm">
							{`${filteredTracks.length} tracks`}
						</div>
					</div>
				</div>
			</header>

			<main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
				<section>
					<h2 className="text-xl font-semibold text-gray-200 mb-4">{'Cumulative & Delta Days'}</h2>
					<LineScatterChart
						title="Cumulative Count & Delta Days (Log Scale)"
						lineData={cumulativeData}
						scatterData={deltaDaysData}
						lineLabel="Cumulative Count"
						scatterLabel="Delta Days"
						yAxisLabel="Count / Days"
						logScale={true}
						className="h-80"
					/>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-gray-200 mb-4">{'Frequency Analysis'}</h2>
					<LineScatterChart
						title="Tracks Per Day - Rolling Averages"
						lineData={frequencyData.monthlyAvg}
						scatterData={frequencyData.weeklyAvg}
						lineLabel="Monthly Avg"
						scatterLabel="Weekly Avg"
						yAxisLabel="Tracks per Day"
						useSingleAxis={true}
						className="h-80"
					/>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-gray-200 mb-4">{'Time of Day Analysis'}</h2>
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<TimeOfDayScatter
							title="Time of Day by Date"
							data={timeOfDayData}
							className="h-80"
						/>
						<PolarChart
							title="Hourly Distribution"
							data={hourlyDistribution.data}
							labels={hourlyDistribution.labels}
							className="h-80"
						/>
					</div>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-gray-200 mb-4">{'Weekday Analysis'}</h2>
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
						<WeekdayScatter
							title="Delta Days by Weekday"
							data={weekdayScatterData}
							logScale={true}
							className="h-80"
						/>
						<HeatmapChart
							title="Weekday Heatmap"
							data={weekdayHeatmapData.data}
							xLabels={weekdayHeatmapData.xLabels}
							yLabels={weekdayHeatmapData.yLabels}
							className="h-80"
						/>
						<PolarChart
							title="Weekday Distribution"
							data={weekdayDistribution.data}
							labels={weekdayDistribution.labels}
							className="h-80"
						/>
					</div>
				</section>

				<section>
					<h2 className="text-xl font-semibold text-gray-200 mb-4">{'Delta Days by Time of Day'}</h2>
					<DeltaByTimeScatter
						title="Delta Days vs Hour of Day"
						data={deltaByTimeData}
						logScale={true}
						className="h-80"
					/>
				</section>
			</main>
		</div>
	)
}
