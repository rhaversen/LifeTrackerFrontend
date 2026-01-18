import { useMemo } from 'react'

import type { ProcessedTrack, Track } from '@/types/Track'

export function useProcessedTracks (tracks: Track[]): ProcessedTrack[] {
	return useMemo(() => {
		const sorted = [...tracks].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

		return sorted.map((track, index) => {
			const dateObj = new Date(track.date)
			const prevTrack = index > 0 ? sorted[index - 1] : null
			const deltaDays = prevTrack
				? (dateObj.getTime() - new Date(prevTrack.date).getTime()) / (1000 * 60 * 60 * 24)
				: null

			return {
				...track,
				dateObj,
				dayOfWeek: (dateObj.getDay() + 6) % 7 + (dateObj.getHours() + dateObj.getMinutes() / 60) / 24,
				hourOfDay: dateObj.getHours() + dateObj.getMinutes() / 60,
				deltaDays
			}
		})
	}, [tracks])
}

export function useCumulativeData (tracks: ProcessedTrack[]): { x: Date, y: number }[] {
	return useMemo(() => {
		return tracks.map((_, index) => ({
			x: tracks[index].dateObj,
			y: index + 1
		}))
	}, [tracks])
}

export function useDeltaDaysData (tracks: ProcessedTrack[]): { x: Date, y: number }[] {
	return useMemo(() => {
		return tracks
			.filter(t => t.deltaDays !== null)
			.map(t => ({
				x: t.dateObj,
				y: t.deltaDays!
			}))
	}, [tracks])
}

function calculateRollingAverage (values: number[], windowSize: number): number[] {
	const halfWindow = Math.floor(windowSize / 2)
	return values.map((_, i) => {
		const start = Math.max(0, i - halfWindow)
		const end = Math.min(values.length, i + halfWindow + 1)
		const window = values.slice(start, end)
		return window.reduce((a, b) => a + b, 0) / window.length
	})
}

export function useFrequencyData (tracks: ProcessedTrack[]): {
	weeklyAvg: { x: Date, y: number }[]
	monthlyAvg: { x: Date, y: number }[]
} {
	return useMemo(() => {
		if (tracks.length === 0) {
			return { weeklyAvg: [], monthlyAvg: [] }
		}

		const dailyCounts: Record<string, number> = {}
		tracks.forEach(t => {
			const dateKey = t.dateObj.toISOString().split('T')[0]
			dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1
		})

		const sortedDates = Object.keys(dailyCounts).sort()
		const counts = sortedDates.map(d => dailyCounts[d])

		const weeklyAvg = calculateRollingAverage(counts, 7)
		const monthlyAvg = calculateRollingAverage(counts, 30)

		return {
			weeklyAvg: sortedDates.map((date, i) => ({
				x: new Date(date),
				y: weeklyAvg[i]
			})),
			monthlyAvg: sortedDates.map((date, i) => ({
				x: new Date(date),
				y: monthlyAvg[i]
			}))
		}
	}, [tracks])
}

export function useTimeOfDayData (tracks: ProcessedTrack[]): { x: Date, y: number }[] {
	return useMemo(() => {
		return tracks.map(t => ({
			x: t.dateObj,
			y: t.hourOfDay
		}))
	}, [tracks])
}

export function useHourlyDistribution (tracks: ProcessedTrack[]): { data: number[], labels: string[] } {
	return useMemo(() => {
		const hourCounts = new Array(24).fill(0)
		tracks.forEach(t => {
			hourCounts[Math.floor(t.hourOfDay)]++
		})

		return {
			data: hourCounts,
			labels: Array.from({ length: 24 }, (_, i) => `${i}:00`)
		}
	}, [tracks])
}

export function useWeekdayScatterData (tracks: ProcessedTrack[]): { x: number, y: number }[] {
	return useMemo(() => {
		return tracks
			.filter(t => t.deltaDays !== null)
			.map(t => ({
				x: t.dayOfWeek,
				y: t.deltaDays!
			}))
	}, [tracks])
}

export function useWeekdayDistribution (tracks: ProcessedTrack[]): { data: number[], labels: string[] } {
	return useMemo(() => {
		const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
		const dayCounts = new Array(7).fill(0)
		tracks.forEach(t => {
			const dayIndex = (t.dateObj.getDay() + 6) % 7
			dayCounts[dayIndex]++
		})

		return {
			data: dayCounts,
			labels: days
		}
	}, [tracks])
}

export function useWeekdayHeatmapData (tracks: ProcessedTrack[]): {
	data: number[][]
	xLabels: string[]
	yLabels: string[]
} {
	return useMemo(() => {
		const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
		const hours = Array.from({ length: 24 }, (_, i) => i)

		// Matrix: rows = hours (y-axis), columns = days (x-axis)
		const matrix: number[][] = hours.map(() => new Array(7).fill(0))

		tracks.forEach(t => {
			const dayIndex = (t.dateObj.getDay() + 6) % 7
			const hourIndex = Math.floor(t.hourOfDay)
			if (hourIndex >= 0 && hourIndex < 24) {
				matrix[hourIndex][dayIndex]++
			}
		})

		return {
			data: matrix,
			xLabels: days,
			yLabels: hours.map(h => `${h}:00`)
		}
	}, [tracks])
}

export function useDeltaByTimeData (tracks: ProcessedTrack[]): { x: number, y: number }[] {
	return useMemo(() => {
		return tracks
			.filter(t => t.deltaDays !== null)
			.map(t => ({
				x: t.hourOfDay,
				y: t.deltaDays!
			}))
	}, [tracks])
}

export function useCalendarHeatmapData (tracks: ProcessedTrack[]): {
	data: Map<string, number>
	yearRange: { start: number, end: number }
} {
	return useMemo(() => {
		const data = new Map<string, number>()
		let minYear = new Date().getFullYear()
		let maxYear = minYear

		tracks.forEach(t => {
			const dateKey = t.dateObj.toISOString().split('T')[0]
			data.set(dateKey, (data.get(dateKey) ?? 0) + 1)
			const year = t.dateObj.getFullYear()
			minYear = Math.min(minYear, year)
			maxYear = Math.max(maxYear, year)
		})

		return {
			data,
			yearRange: { start: minYear, end: maxYear }
		}
	}, [tracks])
}

export function useGapHistogramData (tracks: ProcessedTrack[]): {
	bins: number[]
	labels: string[]
	maxGap: number
} {
	return useMemo(() => {
		const gaps = tracks
			.filter(t => t.deltaDays !== null && t.deltaDays > 0)
			.map(t => t.deltaDays!)

		if (gaps.length === 0) {
			return { bins: [], labels: [], maxGap: 0 }
		}

		const maxGap = Math.max(...gaps)
		const binCount = Math.min(Math.ceil(maxGap), 20)
		const binSize = maxGap / binCount

		const bins = new Array(binCount).fill(0)
		gaps.forEach(gap => {
			const binIndex = Math.min(Math.floor(gap / binSize), binCount - 1)
			bins[binIndex]++
		})

		const labels = bins.map((_, i) => {
			const start = (i * binSize).toFixed(1)
			const end = ((i + 1) * binSize).toFixed(1)
			return `${start}-${end}`
		})

		return { bins, labels, maxGap }
	}, [tracks])
}

export interface BoxPlotStats {
	min: number
	q1: number
	median: number
	q3: number
	max: number
	outliers: number[]
}

function calculateBoxPlotStats (values: number[]): BoxPlotStats | null {
	if (values.length === 0) { return null }

	const sorted = [...values].sort((a, b) => a - b)
	const q1Index = Math.floor(sorted.length * 0.25)
	const medianIndex = Math.floor(sorted.length * 0.5)
	const q3Index = Math.floor(sorted.length * 0.75)

	const q1 = sorted[q1Index]
	const median = sorted[medianIndex]
	const q3 = sorted[q3Index]
	const iqr = q3 - q1
	const lowerFence = q1 - 1.5 * iqr
	const upperFence = q3 + 1.5 * iqr

	const outliers = sorted.filter(v => v < lowerFence || v > upperFence)
	const nonOutliers = sorted.filter(v => v >= lowerFence && v <= upperFence)

	return {
		min: nonOutliers.length > 0 ? nonOutliers[0] : sorted[0],
		q1,
		median,
		q3,
		max: nonOutliers.length > 0 ? nonOutliers[nonOutliers.length - 1] : sorted[sorted.length - 1],
		outliers
	}
}

export function useWeekdayBoxPlotData (tracks: ProcessedTrack[]): {
	stats: (BoxPlotStats | null)[]
	labels: string[]
} {
	return useMemo(() => {
		const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
		const dayGaps: number[][] = Array.from({ length: 7 }, () => [])

		tracks.forEach(t => {
			if (t.deltaDays !== null && t.deltaDays > 0) {
				const dayIndex = (t.dateObj.getDay() + 6) % 7
				dayGaps[dayIndex].push(t.deltaDays)
			}
		})

		return {
			stats: dayGaps.map(gaps => calculateBoxPlotStats(gaps)),
			labels: days
		}
	}, [tracks])
}

export function useMonthlyBoxPlotData (tracks: ProcessedTrack[]): {
	stats: (BoxPlotStats | null)[]
	labels: string[]
} {
	return useMemo(() => {
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
		const monthGaps: number[][] = Array.from({ length: 12 }, () => [])

		tracks.forEach(t => {
			if (t.deltaDays !== null && t.deltaDays > 0) {
				const monthIndex = t.dateObj.getMonth()
				monthGaps[monthIndex].push(t.deltaDays)
			}
		})

		return {
			stats: monthGaps.map(gaps => calculateBoxPlotStats(gaps)),
			labels: months
		}
	}, [tracks])
}
