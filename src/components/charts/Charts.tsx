'use client'

import {
	ArcElement,
	BarController,
	BarElement,
	CategoryScale,
	Chart as ChartJS,
	Filler,
	Legend,
	LinearScale,
	LineController,
	LineElement,
	LogarithmicScale,
	PointElement,
	PolarAreaController,
	RadarController,
	RadialLinearScale,
	ScatterController,
	TimeScale,
	Title,
	Tooltip
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { useEffect, useRef, useState, type ReactElement } from 'react'

import type { BoxPlotStats } from '@/hooks/useTrackData'

ChartJS.register(
	ArcElement,
	BarController,
	BarElement,
	CategoryScale,
	LinearScale,
	LineController,
	LogarithmicScale,
	PolarAreaController,
	RadarController,
	RadialLinearScale,
	ScatterController,
	TimeScale,
	PointElement,
	LineElement,
	Filler,
	Title,
	Tooltip,
	Legend
)

interface BaseChartProps {
	title: string
	className?: string
}

interface LineScatterChartProps extends BaseChartProps {
	lineData: { x: Date, y: number }[]
	scatterData: { x: Date, y: number }[]
	lineLabel: string
	scatterLabel: string
	yAxisLabel: string
	logScale?: boolean
	useSingleAxis?: boolean
}

export function LineScatterChart ({
	title,
	lineData,
	scatterData,
	lineLabel,
	scatterLabel,
	yAxisLabel,
	logScale = false,
	useSingleAxis = false,
	className = ''
}: LineScatterChartProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const chartRef = useRef<ChartJS | null>(null)

	useEffect(() => {
		if (!canvasRef.current) {
			return
		}

		if (chartRef.current) {
			chartRef.current.destroy()
		}

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) {
			return
		}

		const lineDataTimestamp = lineData.map(d => ({ x: d.x.getTime(), y: d.y }))
		const scatterDataTimestamp = scatterData.map(d => ({ x: d.x.getTime(), y: d.y }))

		chartRef.current = new ChartJS(ctx, {
			type: 'scatter',
			data: {
				datasets: [
					{
						type: 'line',
						label: lineLabel,
						data: lineDataTimestamp,
						borderColor: 'rgba(59, 130, 246, 1)',
						backgroundColor: 'rgba(59, 130, 246, 0.1)',
						fill: true,
						tension: 0.1,
						pointRadius: 0,
						yAxisID: useSingleAxis ? 'yLeft' : 'yRight'
					},
					{
						type: 'scatter',
						label: scatterLabel,
						data: scatterDataTimestamp,
						backgroundColor: 'rgba(59, 130, 246, 0.6)',
						pointRadius: 2,
						yAxisID: 'yLeft'
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					title: { display: true, text: title, color: '#e5e7eb' },
					legend: { labels: { color: '#e5e7eb' } }
				},
				scales: {
					x: {
						type: 'time',
						time: { unit: 'day' },
						ticks: { color: '#9ca3af' },
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					},
					yLeft: {
						type: logScale ? 'logarithmic' : 'linear',
						position: 'left',
						title: { display: true, text: yAxisLabel, color: '#e5e7eb' },
						ticks: { color: '#9ca3af' },
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					},
					...(useSingleAxis ? {} : {
						yRight: {
							type: 'linear',
							position: 'right',
							title: { display: true, text: lineLabel, color: '#e5e7eb' },
							ticks: { color: '#9ca3af' },
							grid: { color: 'rgba(75, 85, 99, 0.3)' }
						}
					})
				}
			}
		})

		return () => {
			chartRef.current?.destroy()
		}
	}, [lineData, scatterData, lineLabel, scatterLabel, yAxisLabel, logScale, useSingleAxis, title])

	return (
		<div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
			<canvas ref={canvasRef} />
		</div>
	)
}

interface TimeOfDayScatterProps extends BaseChartProps {
	data: { x: Date, y: number }[]
}

export function TimeOfDayScatter ({ title, data, className = '' }: TimeOfDayScatterProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const chartRef = useRef<ChartJS | null>(null)

	useEffect(() => {
		if (!canvasRef.current) {
			return
		}

		if (chartRef.current) {
			chartRef.current.destroy()
		}

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) {
			return
		}

		const dataTimestamp = data.map(d => ({ x: d.x.getTime(), y: d.y }))

		chartRef.current = new ChartJS(ctx, {
			type: 'scatter',
			data: {
				datasets: [{
					label: 'Time of Day',
					data: dataTimestamp,
					backgroundColor: 'rgba(59, 130, 246, 0.6)',
					pointRadius: 2
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					title: { display: true, text: title, color: '#e5e7eb' },
					legend: { labels: { color: '#e5e7eb' } }
				},
				scales: {
					x: {
						type: 'time',
						time: { unit: 'day' },
						ticks: { color: '#9ca3af' },
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					},
					y: {
						min: 0,
						max: 24,
						title: { display: true, text: 'Hour of Day', color: '#e5e7eb' },
						ticks: {
							color: '#9ca3af',
							stepSize: 4,
							callback: (value) => `${value}:00`
						},
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					}
				}
			}
		})

		return () => {
			chartRef.current?.destroy()
		}
	}, [data, title])

	return (
		<div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
			<canvas ref={canvasRef} />
		</div>
	)
}

interface PolarChartProps extends BaseChartProps {
	data: number[]
	labels: string[]
}

export function PolarChart ({ title, data, labels, className = '' }: PolarChartProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const chartRef = useRef<ChartJS | null>(null)

	useEffect(() => {
		if (!canvasRef.current) {
			return
		}

		if (chartRef.current) {
			chartRef.current.destroy()
		}

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) {
			return
		}

		chartRef.current = new ChartJS(ctx, {
			type: 'radar',
			data: {
				labels,
				datasets: [{
					data,
					backgroundColor: 'rgba(59, 130, 246, 0.1)',
					borderColor: 'rgba(59, 130, 246, 1)',
					borderWidth: 2,
					pointBackgroundColor: 'rgba(59, 130, 246, 1)',
					pointBorderColor: 'rgba(59, 130, 246, 1)',
					pointRadius: 2
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					title: { display: true, text: title, color: '#e5e7eb' },
					legend: { display: false }
				},
				scales: {
					r: {
						beginAtZero: true,
						min: 0,
						ticks: { color: '#9ca3af', backdropColor: 'transparent' },
						grid: { color: 'rgba(75, 85, 99, 0.3)' },
						angleLines: { color: 'rgba(75, 85, 99, 0.3)' },
						pointLabels: { color: '#e5e7eb', font: { size: 11 } }
					}
				}
			}
		})

		return () => {
			chartRef.current?.destroy()
		}
	}, [data, labels, title])

	return (
		<div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
			<canvas ref={canvasRef} />
		</div>
	)
}

interface WeekdayScatterProps extends BaseChartProps {
	data: { x: number, y: number }[]
	logScale?: boolean
}

export function WeekdayScatter ({ title, data, logScale = false, className = '' }: WeekdayScatterProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const chartRef = useRef<ChartJS | null>(null)

	useEffect(() => {
		if (!canvasRef.current) {
			return
		}

		if (chartRef.current) {
			chartRef.current.destroy()
		}

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) {
			return
		}

		const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

		chartRef.current = new ChartJS(ctx, {
			type: 'scatter',
			data: {
				datasets: [{
					label: 'Delta Days',
					data,
					backgroundColor: 'rgba(59, 130, 246, 0.6)',
					pointRadius: 2
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					title: { display: true, text: title, color: '#e5e7eb' },
					legend: { labels: { color: '#e5e7eb' } }
				},
				scales: {
					x: {
						min: 0,
						max: 7,
						title: { display: true, text: 'Day of Week', color: '#e5e7eb' },
						ticks: {
							color: '#9ca3af',
							stepSize: 1,
							callback: (value) => days[Math.floor(Number(value)) % 7] || ''
						},
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					},
					y: {
						type: logScale ? 'logarithmic' : 'linear',
						title: { display: true, text: 'Delta Days', color: '#e5e7eb' },
						ticks: { color: '#9ca3af' },
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					}
				}
			}
		})

		return () => {
			chartRef.current?.destroy()
		}
	}, [data, title, logScale])

	return (
		<div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
			<canvas ref={canvasRef} />
		</div>
	)
}

interface HeatmapChartProps extends BaseChartProps {
	data: number[][]
	xLabels: string[]
	yLabels: string[]
}

export function HeatmapChart ({ title, data, xLabels, yLabels, className = '' }: HeatmapChartProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		if (!canvasRef.current) {
			return
		}

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) {
			return
		}

		const canvas = canvasRef.current
		const width = canvas.width = canvas.offsetWidth * 2
		const height = canvas.height = canvas.offsetHeight * 2
		ctx.scale(2, 2)

		const padding = { top: 40, right: 20, bottom: 40, left: 50 }
		const cellWidth = (width / 2 - padding.left - padding.right) / xLabels.length
		const cellHeight = (height / 2 - padding.top - padding.bottom) / yLabels.length

		const maxVal = Math.max(...data.flat(), 1)

		ctx.fillStyle = '#1f2937'
		ctx.fillRect(0, 0, width / 2, height / 2)

		ctx.fillStyle = '#e5e7eb'
		ctx.font = '14px sans-serif'
		ctx.textAlign = 'center'
		ctx.fillText(title, width / 4, 20)

		data.forEach((row, yi) => {
			row.forEach((value, xi) => {
				const intensity = value / maxVal
				const hue = 200
				const saturation = 70
				const lightness = 90 - intensity * 60

				ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`
				ctx.fillRect(
					padding.left + xi * cellWidth,
					padding.top + yi * cellHeight,
					cellWidth - 1,
					cellHeight - 1
				)
			})
		})

		ctx.fillStyle = '#9ca3af'
		ctx.font = '10px sans-serif'
		ctx.textAlign = 'center'
		xLabels.forEach((label, i) => {
			ctx.fillText(label, padding.left + i * cellWidth + cellWidth / 2, height / 2 - padding.bottom + 15)
		})

		ctx.textAlign = 'right'
		yLabels.forEach((label, i) => {
			ctx.fillText(label, padding.left - 5, padding.top + i * cellHeight + cellHeight / 2 + 4)
		})
	}, [data, xLabels, yLabels, title])

	return (
		<div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
			<canvas ref={canvasRef} className="w-full h-full" />
		</div>
	)
}

interface DeltaByTimeScatterProps extends BaseChartProps {
	data: { x: number, y: number }[]
	logScale?: boolean
}

export function DeltaByTimeScatter ({ title, data, logScale = false, className = '' }: DeltaByTimeScatterProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const chartRef = useRef<ChartJS | null>(null)

	useEffect(() => {
		if (!canvasRef.current) {
			return
		}

		if (chartRef.current) {
			chartRef.current.destroy()
		}

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) {
			return
		}

		chartRef.current = new ChartJS(ctx, {
			type: 'scatter',
			data: {
				datasets: [{
					label: 'Delta Days',
					data,
					backgroundColor: 'rgba(59, 130, 246, 0.6)',
					pointRadius: 2
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					title: { display: true, text: title, color: '#e5e7eb' },
					legend: { labels: { color: '#e5e7eb' } }
				},
				scales: {
					x: {
						min: 0,
						max: 24,
						title: { display: true, text: 'Hour of Day', color: '#e5e7eb' },
						ticks: {
							color: '#9ca3af',
							stepSize: 4,
							callback: (value) => `${value}:00`
						},
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					},
					y: {
						type: logScale ? 'logarithmic' : 'linear',
						title: { display: true, text: 'Delta Days', color: '#e5e7eb' },
						ticks: { color: '#9ca3af' },
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					}
				}
			}
		})

		return () => {
			chartRef.current?.destroy()
		}
	}, [data, title, logScale])

	return (
		<div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
			<canvas ref={canvasRef} />
		</div>
	)
}

interface CalendarHeatmapProps extends BaseChartProps {
	data: Map<string, number>
	yearRange: { start: number, end: number }
}

export function CalendarHeatmap ({ title, data, yearRange, className = '' }: CalendarHeatmapProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const [tooltip, setTooltip] = useState<{ x: number, y: number, date: string, count: number } | null>(null)

	useEffect(() => {
		if (!canvasRef.current) { return }

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) { return }

		const canvas = canvasRef.current
		const cellSize = 10
		const cellGap = 2
		const labelWidth = 20
		const paddingRight = 10

		const startDate = new Date(yearRange.start, 0, 1)
		const endDate = new Date(yearRange.end, 11, 31)
		const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
		const totalWeeks = Math.ceil(totalDays / 7) + 1

		const totalWidth = labelWidth + totalWeeks * (cellSize + cellGap) + paddingRight
		const totalHeight = 7 * (cellSize + cellGap) + 4

		canvas.width = totalWidth * 2
		canvas.height = totalHeight * 2
		ctx.scale(2, 2)

		ctx.fillStyle = '#1f2937'
		ctx.fillRect(0, 0, totalWidth, totalHeight)

		const maxVal = Math.max(...data.values(), 1)
		const days = ['M', '', 'W', '', 'F', '', 'S']

		ctx.fillStyle = '#9ca3af'
		ctx.font = '9px sans-serif'
		ctx.textAlign = 'right'
		days.forEach((day, i) => {
			if (day) {
				ctx.fillText(day, labelWidth - 3, 2 + i * (cellSize + cellGap) + cellSize - 2)
			}
		})

		const firstDayOffset = (startDate.getDay() + 6) % 7

		for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
			const daysSinceStart = Math.floor((d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
			const weekNum = Math.floor((daysSinceStart + firstDayOffset) / 7)
			const dayOfWeek = (d.getDay() + 6) % 7

			const dateKey = d.toISOString().split('T')[0]
			const count = data.get(dateKey) ?? 0

			const x = labelWidth + weekNum * (cellSize + cellGap)
			const y = 2 + dayOfWeek * (cellSize + cellGap)

			if (count === 0) {
				ctx.fillStyle = '#374151'
			} else {
				const intensity = Math.min(count / maxVal, 1)
				const lightness = 70 - intensity * 40
				ctx.fillStyle = `hsl(200, 70%, ${lightness}%)`
			}

			ctx.fillRect(x, y, cellSize, cellSize)
		}

		const handleMouseMove = (e: MouseEvent): void => {
			const rect = canvas.getBoundingClientRect()
			const scaleX = canvas.width / rect.width
			const scaleY = canvas.height / rect.height
			const mouseX = (e.clientX - rect.left) * scaleX / 2
			const mouseY = (e.clientY - rect.top) * scaleY / 2

			if (mouseX < labelWidth || mouseY < 2) {
				setTooltip(null)
				return
			}

			const weekNum = Math.floor((mouseX - labelWidth) / (cellSize + cellGap))
			const dayOfWeek = Math.floor((mouseY - 2) / (cellSize + cellGap))

			if (dayOfWeek < 0 || dayOfWeek >= 7) {
				setTooltip(null)
				return
			}

			const daysSinceStart = weekNum * 7 + dayOfWeek - firstDayOffset
			if (daysSinceStart < 0 || daysSinceStart >= totalDays) {
				setTooltip(null)
				return
			}

			const date = new Date(startDate)
			date.setDate(date.getDate() + daysSinceStart)

			const dateKey = date.toISOString().split('T')[0]
			const count = data.get(dateKey) ?? 0

			setTooltip({
				x: e.clientX - rect.left,
				y: e.clientY - rect.top,
				date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
				count
			})
		}

		const handleMouseLeave = (): void => {
			setTooltip(null)
		}

		canvas.addEventListener('mousemove', handleMouseMove)
		canvas.addEventListener('mouseleave', handleMouseLeave)

		return () => {
			canvas.removeEventListener('mousemove', handleMouseMove)
			canvas.removeEventListener('mouseleave', handleMouseLeave)
		}
	}, [data, yearRange, title])

	useEffect(() => {
		if (containerRef.current) {
			containerRef.current.scrollLeft = containerRef.current.scrollWidth
		}
	}, [data, yearRange])

	return (
		<div ref={containerRef} className={`bg-gray-800 rounded-lg p-3 overflow-x-auto relative ${className}`}>
			<canvas ref={canvasRef} className="h-[88px]" />
			{tooltip && (
				<div
					className="absolute bg-gray-900 text-white text-xs px-2 py-1 rounded border border-gray-600 pointer-events-none z-10 min-w-32"
					style={{
						left: `${tooltip.x + 10}px`,
						top: `${tooltip.y - 30}px`
					}}
				>
					<div>{tooltip.date}</div>
					<div className="text-blue-400">{`${tooltip.count} track${tooltip.count !== 1 ? 's' : ''}`}</div>
				</div>
			)}
		</div>
	)
}

interface HistogramProps extends BaseChartProps {
	bins: number[]
	labels: string[]
}

export function Histogram ({ title, bins, labels, className = '' }: HistogramProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const chartRef = useRef<ChartJS | null>(null)

	useEffect(() => {
		if (!canvasRef.current) { return }

		if (chartRef.current) {
			chartRef.current.destroy()
		}

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) { return }

		chartRef.current = new ChartJS(ctx, {
			type: 'bar',
			data: {
				labels,
				datasets: [{
					label: 'Frequency',
					data: bins,
					backgroundColor: 'rgba(59, 130, 246, 0.6)',
					borderColor: 'rgba(59, 130, 246, 1)',
					borderWidth: 1
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					title: { display: true, text: title, color: '#e5e7eb' },
					legend: { display: false }
				},
				scales: {
					x: {
						title: { display: true, text: 'Gap (days)', color: '#e5e7eb' },
						ticks: { color: '#9ca3af', maxRotation: 45, minRotation: 45 },
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					},
					y: {
						type: 'logarithmic',
						title: { display: true, text: 'Count', color: '#e5e7eb' },
						ticks: { color: '#9ca3af' },
						grid: { color: 'rgba(75, 85, 99, 0.3)' }
					}
				}
			}
		})

		return () => {
			chartRef.current?.destroy()
		}
	}, [bins, labels, title])

	return (
		<div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
			<canvas ref={canvasRef} />
		</div>
	)
}

interface BoxPlotProps extends BaseChartProps {
	stats: (BoxPlotStats | null)[]
	labels: string[]
}

export function BoxPlot ({ title, stats, labels, className = '' }: BoxPlotProps): ReactElement {
	const canvasRef = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		if (!canvasRef.current) { return }

		const ctx = canvasRef.current.getContext('2d')
		if (!ctx) { return }

		const canvas = canvasRef.current
		const width = canvas.width = canvas.offsetWidth * 2
		const height = canvas.height = canvas.offsetHeight * 2
		ctx.scale(2, 2)

		const padding = { top: 40, right: 30, bottom: 50, left: 50 }
		const chartWidth = width / 2 - padding.left - padding.right
		const chartHeight = height / 2 - padding.top - padding.bottom

		ctx.fillStyle = '#1f2937'
		ctx.fillRect(0, 0, width / 2, height / 2)

		ctx.fillStyle = '#e5e7eb'
		ctx.font = '14px sans-serif'
		ctx.textAlign = 'center'
		ctx.fillText(title, width / 4, 20)

		const validStats = stats.filter((s): s is BoxPlotStats => s !== null)
		if (validStats.length === 0) {
			ctx.fillStyle = '#9ca3af'
			ctx.fillText('No data', width / 4, height / 4)
			return
		}

		const allValues = validStats.flatMap(s => [s.min, s.max, ...s.outliers]).filter(v => v > 0)
		const maxY = Math.max(...allValues, 1)
		const minY = Math.min(...allValues.filter(v => v > 0), 0.1)

		const boxWidth = chartWidth / labels.length * 0.6
		const boxGap = chartWidth / labels.length

		const scaleY = (value: number): number => {
			const safeValue = Math.max(value, minY)
			const logMin = Math.log10(minY)
			const logMax = Math.log10(maxY)
			const logValue = Math.log10(safeValue)
			return padding.top + chartHeight - (logValue - logMin) / (logMax - logMin) * chartHeight
		}

		ctx.strokeStyle = 'rgba(75, 85, 99, 0.3)'
		ctx.lineWidth = 1
		const logMin = Math.log10(minY)
		const logMax = Math.log10(maxY)
		const gridLines = 5
		for (let i = 0; i <= gridLines; i++) {
			const logValue = logMax - (logMax - logMin) * i / gridLines
			const value = Math.pow(10, logValue)
			const y = padding.top + chartHeight * i / gridLines
			ctx.beginPath()
			ctx.moveTo(padding.left, y)
			ctx.lineTo(width / 2 - padding.right, y)
			ctx.stroke()

			ctx.fillStyle = '#9ca3af'
			ctx.font = '10px sans-serif'
			ctx.textAlign = 'right'
			ctx.fillText(value < 1 ? value.toFixed(2) : value.toFixed(1), padding.left - 5, y + 3)
		}

		stats.forEach((stat, i) => {
			const x = padding.left + boxGap * i + boxGap / 2

			ctx.fillStyle = '#9ca3af'
			ctx.font = '10px sans-serif'
			ctx.textAlign = 'center'
			ctx.fillText(labels[i], x, height / 2 - padding.bottom + 15)

			if (!stat) { return }

			ctx.strokeStyle = 'rgba(59, 130, 246, 1)'
			ctx.fillStyle = 'rgba(59, 130, 246, 0.3)'
			ctx.lineWidth = 2

			const q1Y = scaleY(stat.q1)
			const q3Y = scaleY(stat.q3)
			const medianY = scaleY(stat.median)
			const minYScaled = scaleY(stat.min)
			const maxYScaled = scaleY(stat.max)

			ctx.fillRect(x - boxWidth / 2, q3Y, boxWidth, q1Y - q3Y)
			ctx.strokeRect(x - boxWidth / 2, q3Y, boxWidth, q1Y - q3Y)

			ctx.beginPath()
			ctx.moveTo(x - boxWidth / 2, medianY)
			ctx.lineTo(x + boxWidth / 2, medianY)
			ctx.stroke()

			ctx.beginPath()
			ctx.moveTo(x, q3Y)
			ctx.lineTo(x, maxYScaled)
			ctx.moveTo(x - boxWidth / 4, maxYScaled)
			ctx.lineTo(x + boxWidth / 4, maxYScaled)
			ctx.stroke()

			ctx.beginPath()
			ctx.moveTo(x, q1Y)
			ctx.lineTo(x, minYScaled)
			ctx.moveTo(x - boxWidth / 4, minYScaled)
			ctx.lineTo(x + boxWidth / 4, minYScaled)
			ctx.stroke()

			ctx.fillStyle = 'rgba(59, 130, 246, 0.6)'
			stat.outliers.forEach(outlier => {
				const y = scaleY(outlier)
				ctx.beginPath()
				ctx.arc(x, y, 3, 0, Math.PI * 2)
				ctx.fill()
			})
		})

		ctx.fillStyle = '#e5e7eb'
		ctx.font = '11px sans-serif'
		ctx.save()
		ctx.translate(15, height / 4)
		ctx.rotate(-Math.PI / 2)
		ctx.textAlign = 'center'
		ctx.fillText('Days', 0, 0)
		ctx.restore()
	}, [stats, labels, title])

	return (
		<div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
			<canvas ref={canvasRef} className="w-full h-full" />
		</div>
	)
}
