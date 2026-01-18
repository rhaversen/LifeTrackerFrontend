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
