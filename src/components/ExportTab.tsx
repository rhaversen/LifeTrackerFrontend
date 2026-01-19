'use client'

import axios from 'axios'
import { useState, useEffect, useCallback, type ReactElement } from 'react'

import type { Track } from '@/types/Track'

const API_URL = process.env.NEXT_PUBLIC_API_URL

type FormatType = 'string' | 'iso'
type OutputType = 'list' | 'json'

function formatDateTime (date: Date): string {
	const day = date.getDate().toString().padStart(2, '0')
	const month = (date.getMonth() + 1).toString().padStart(2, '0')
	const year = date.getFullYear()
	const hours = date.getHours().toString().padStart(2, '0')
	const minutes = date.getMinutes().toString().padStart(2, '0')
	const seconds = date.getSeconds().toString().padStart(2, '0')
	return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

export default function ExportTab (): ReactElement {
	const [tracks, setTracks] = useState<Track[]>([])
	const [trackTypes, setTrackTypes] = useState<string[]>([])
	const [selectedType, setSelectedType] = useState<string>('all')
	const [formatType, setFormatType] = useState<FormatType>('string')
	const [outputType, setOutputType] = useState<OutputType>('list')
	const [loading, setLoading] = useState(true)
	const [exportedData, setExportedData] = useState<string>('')

	const fetchTracks = useCallback(async (): Promise<void> => {
		setLoading(true)
		try {
			const response = await axios.get<Track[]>(`${API_URL}/v1/tracks`, {
				withCredentials: true
			})
			setTracks(response.data)

			const types = [...new Set(response.data.map(t => t.trackName))].sort()
			setTrackTypes(types)
		} catch (err) {
			console.error('Failed to fetch tracks:', err)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchTracks().catch(console.error)
	}, [fetchTracks])

	const generateExport = useCallback((): void => {
		const filteredTracks = selectedType === 'all'
			? tracks
			: tracks.filter(t => t.trackName === selectedType)

		const sortedTracks = [...filteredTracks].sort((a, b) =>
			new Date(a.date).getTime() - new Date(b.date).getTime()
		)

		let output = ''

		if (formatType === 'iso') {
			const dates = sortedTracks.map(t => t.date)
			if (outputType === 'json') {
				output = JSON.stringify(dates, null, '\t')
			} else {
				output = dates.join('\n')
			}
		} else {
			const dates = sortedTracks.map(t => formatDateTime(new Date(t.date)))
			if (outputType === 'json') {
				output = JSON.stringify(dates, null, '\t')
			} else {
				output = dates.join('\n')
			}
		}

		setExportedData(output)
	}, [tracks, selectedType, formatType, outputType])

	useEffect(() => {
		if (tracks.length > 0) {
			generateExport()
		}
	}, [tracks, selectedType, formatType, outputType, generateExport])

	const handleCopy = async (): Promise<void> => {
		try {
			// eslint-disable-next-line n/no-unsupported-features/node-builtins
			await navigator.clipboard.writeText(exportedData)
		} catch (err) {
			console.error('Failed to copy:', err)
		}
	}

	const handleDownload = (): void => {
		const blob = new Blob([exportedData], { type: 'text/plain' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `tracks_${selectedType}_${formatType}_${new Date().toISOString().slice(0, 10)}.${outputType === 'json' ? 'json' : 'txt'}`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

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
				<div className="text-gray-400 text-xl mb-2">{'No tracks to export'}</div>
				<div className="text-gray-500">{'Add some tracks first'}</div>
			</div>
		)
	}

	const filteredCount = selectedType === 'all'
		? tracks.length
		: tracks.filter(t => t.trackName === selectedType).length

	return (
		<div className="max-w-4xl mx-auto">
			<div className="bg-gray-800 rounded-lg p-6 space-y-6">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div>
						<label htmlFor="trackType" className="block text-gray-300 mb-2 font-medium">
							{'Track Type'}
						</label>
						<select
							id="trackType"
							value={selectedType}
							onChange={(e) => setSelectedType(e.target.value)}
							className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							<option value="all">{`All Types (${tracks.length})`}</option>
							{trackTypes.map(type => {
								const count = tracks.filter(t => t.trackName === type).length
								return (
									<option key={type} value={type}>
										{`${type} (${count})`}
									</option>
								)
							})}
						</select>
					</div>

					<div>
						<label htmlFor="format" className="block text-gray-300 mb-2 font-medium">
							{'Date Format'}
						</label>
						<select
							id="format"
							value={formatType}
							onChange={(e) => setFormatType(e.target.value as FormatType)}
							className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							<option value="string">{'String (DD/MM/YYYY HH:mm:ss)'}</option>
							<option value="iso">{'ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)'}</option>
						</select>
					</div>

					<div>
						<label htmlFor="output" className="block text-gray-300 mb-2 font-medium">
							{'Output Format'}
						</label>
						<select
							id="output"
							value={outputType}
							onChange={(e) => setOutputType(e.target.value as OutputType)}
							className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							<option value="list">{'Plain List'}</option>
							<option value="json">{'JSON Array'}</option>
						</select>
					</div>
				</div>

				<div className="flex items-center justify-between">
					<div className="text-gray-400 text-sm">
						{`Exporting ${filteredCount} track${filteredCount !== 1 ? 's' : ''}`}
					</div>
					<div className="flex gap-2">
						<button
							onClick={handleCopy}
							className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
						>
							{'📋 Copy'}
						</button>
						<button
							onClick={handleDownload}
							className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
						>
							{'⬇️ Download'}
						</button>
					</div>
				</div>

				<div>
					<label htmlFor="exportData" className="block text-gray-300 mb-2 font-medium">
						{'Exported Data'}
					</label>
					<textarea
						id="exportData"
						value={exportedData}
						readOnly
						rows={20}
						className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
					/>
				</div>

				<div className="bg-gray-700/50 rounded-lg p-4 space-y-2">
					<div className="text-gray-300 text-sm font-medium">{'Format Examples:'}</div>
					<div className="space-y-1 text-xs font-mono">
						<div className="text-gray-400">
							<span className="text-gray-500">{'String:'}</span>
							{' 12/01/2021 08:51:00'}
						</div>
						<div className="text-gray-400">
							<span className="text-gray-500">{'ISO:'}</span>
							{' 2021-01-12T08:51:00.000Z'}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
