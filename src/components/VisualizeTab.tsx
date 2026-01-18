'use client'

import axios from 'axios'
import { useEffect, useMemo, useState, type ReactElement } from 'react'

import {
	BoxPlot,
	CalendarHeatmap,
	DeltaByTimeScatter,
	HeatmapChart,
	Histogram,
	LineScatterChart,
	PolarChart,
	TimeOfDayScatter,
	WeekdayScatter
} from '@/components/charts/Charts'
import {
	useCalendarHeatmapData,
	useCumulativeData,
	useDeltaByTimeData,
	useDeltaDaysData,
	useFrequencyData,
	useGapHistogramData,
	useHourlyDistribution,
	useMonthlyBoxPlotData,
	useProcessedTracks,
	useTimeOfDayData,
	useWeekdayBoxPlotData,
	useWeekdayDistribution,
	useWeekdayHeatmapData,
	useWeekdayScatterData
} from '@/hooks/useTrackData'
import type { Track } from '@/types/Track'

const API_URL = process.env.NEXT_PUBLIC_API_URL

export default function VisualizeTab (): ReactElement {
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
	const calendarHeatmapData = useCalendarHeatmapData(processedTracks)
	const gapHistogramData = useGapHistogramData(processedTracks)
	const weekdayBoxPlotData = useWeekdayBoxPlotData(processedTracks)
	const monthlyBoxPlotData = useMonthlyBoxPlotData(processedTracks)

	if (loading) {
		return (
			<div className="flex items-center justify-center py-20">
				<div className="text-gray-300 text-xl">{'Loading...'}</div>
			</div>
		)
	}

	return (
		<div className="space-y-6">
			<div className="sticky top-[117px] sm:top-[73px] z-10 bg-gray-900 pt-4 pb-4 border-b border-gray-800 -mx-4 sm:-mx-6">
				<div className="flex items-center gap-2 sm:gap-3 mb-3 px-4 sm:px-6">
					<span className="text-gray-300 text-xs sm:text-sm font-medium whitespace-nowrap">{'Track Type:'}</span>
					<span className="text-gray-400 text-xs sm:text-sm whitespace-nowrap">
						{`${filteredTracks.length} tracks`}
					</span>
				</div>
				<div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-800 px-4 sm:px-6">
					<div className="flex gap-2 pb-2">
						{trackNames.map(name => (
							<button
								key={name}
								onClick={() => setSelectedTrackName(name)}
								className={`px-3 py-2 sm:px-4 sm:py-2 rounded-lg font-medium text-xs sm:text-sm transition-colors whitespace-nowrap ${
									selectedTrackName === name
										? 'bg-blue-600 text-white'
										: 'bg-gray-700 text-gray-300 hover:bg-gray-600'
								}`}
							>
								{name}
							</button>
						))}
					</div>
				</div>
			</div>

			<section>
				<h2 className="text-xl font-semibold text-gray-200 mb-4">{'Activity Calendar'}</h2>
				<CalendarHeatmap
					title="Activity Calendar"
					data={calendarHeatmapData.data}
					yearRange={calendarHeatmapData.yearRange}
				/>
			</section>

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

			<section>
				<h2 className="text-xl font-semibold text-gray-200 mb-4">{'Gap Distribution'}</h2>
				<Histogram
					title="Gap Histogram (Time Between Events)"
					bins={gapHistogramData.bins}
					labels={gapHistogramData.labels}
					className="h-80"
				/>
			</section>

			<section>
				<h2 className="text-xl font-semibold text-gray-200 mb-4">{'Gap Distribution by Period'}</h2>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<BoxPlot
						title="Gap by Weekday"
						stats={weekdayBoxPlotData.stats}
						labels={weekdayBoxPlotData.labels}
						className="h-80"
					/>
					<BoxPlot
						title="Gap by Month"
						stats={monthlyBoxPlotData.stats}
						labels={monthlyBoxPlotData.labels}
						className="h-80"
					/>
				</div>
			</section>
		</div>
	)
}
