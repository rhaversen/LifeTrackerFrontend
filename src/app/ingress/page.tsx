'use client'

import axios from 'axios'
import { useState, type ReactElement } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL

function parseDateTime (input: string): Date | null {
	const match = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/)
	if (!match) {
		return null
	}

	const [, day, month, year, hours, minutes, seconds] = match
	const date = new Date(
		parseInt(year),
		parseInt(month) - 1,
		parseInt(day),
		parseInt(hours),
		parseInt(minutes),
		parseInt(seconds)
	)

	if (isNaN(date.getTime())) {
		return null
	}

	return date
}

export default function Page (): ReactElement {
	const [trackName, setTrackName] = useState('')
	const [rawTimes, setRawTimes] = useState('')
	const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', message: string }>({ type: 'idle', message: '' })

	const handleSubmit = async (): Promise<void> => {
		if (!trackName.trim()) {
			setStatus({ type: 'error', message: 'Please enter a track name' })
			return
		}

		const lines = rawTimes.split('\n').filter(line => line.trim())
		if (lines.length === 0) {
			setStatus({ type: 'error', message: 'Please enter at least one timestamp' })
			return
		}

		const parsedDates: Date[] = []
		const invalidLines: string[] = []

		for (const line of lines) {
			const date = parseDateTime(line)
			if (date) {
				parsedDates.push(date)
			} else {
				invalidLines.push(line)
			}
		}

		if (invalidLines.length > 0) {
			setStatus({ type: 'error', message: `Invalid timestamps:\n${invalidLines.slice(0, 5).join('\n')}${invalidLines.length > 5 ? `\n...and ${invalidLines.length - 5} more` : ''}` })
			return
		}

		setStatus({ type: 'loading', message: `Importing ${parsedDates.length} tracks...` })

		try {
			const response = await axios.post<{ created: number }>(
				`${API_URL}/v1/tracks/import`,
				{
					trackName: trackName.trim(),
					dates: parsedDates.map(d => d.toISOString())
				},
				{ withCredentials: true }
			)
			setStatus({ type: 'success', message: `Successfully created ${response.data.created} tracks` })
			setRawTimes('')
		} catch (error) {
			console.error('Failed to import tracks:', error)
			if (axios.isAxiosError(error) && error.response?.data?.error != null) {
				setStatus({ type: 'error', message: error.response.data.error })
			} else {
				setStatus({ type: 'error', message: 'Failed to import tracks' })
			}
		}
	}

	const previewCount = rawTimes.split('\n').filter(line => line.trim()).length

	return (
		<div className="min-h-screen bg-gray-900">
			<header className="sticky top-0 z-10 bg-gray-800 border-b border-gray-700 px-6 py-4">
				<div className="max-w-3xl mx-auto">
					<h1 className="text-2xl font-bold text-white">{'Track Ingress'}</h1>
				</div>
			</header>

			<main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
				<div className="bg-gray-800 rounded-lg p-6 space-y-4">
					<div>
						<label htmlFor="trackName" className="block text-gray-300 mb-2">{'Track Name'}</label>
						<input
							id="trackName"
							type="text"
							value={trackName}
							onChange={(e) => setTrackName(e.target.value)}
							placeholder="e.g., Reddit"
							className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label htmlFor="timestamps" className="block text-gray-300 mb-2">
							{'Timestamps (DD/MM/YYYY HH:mm:ss, one per line)'}
						</label>
						<textarea
							id="timestamps"
							value={rawTimes}
							onChange={(e) => setRawTimes(e.target.value)}
							placeholder={'12/01/2021 08:51:00\n13/01/2021 14:30:00\n14/01/2021 22:15:00'}
							rows={15}
							className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
						/>
						<div className="text-gray-400 text-sm mt-1">
							{`${previewCount} timestamp${previewCount !== 1 ? 's' : ''} detected`}
						</div>
					</div>

					<div className="text-gray-400 text-sm">
						{'Times will be interpreted as your local timezone and converted to UTC for storage.'}
					</div>

					<button
						onClick={handleSubmit}
						disabled={status.type === 'loading'}
						className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
					>
						{status.type === 'loading' ? 'Importing...' : 'Import Tracks'}
					</button>

					{status.message && (
						<div className={`p-4 rounded-lg ${
							status.type === 'success' ? 'bg-green-900 text-green-200' :
								status.type === 'error' ? 'bg-red-900 text-red-200' :
									'bg-blue-900 text-blue-200'
						}`}>
							<pre className="whitespace-pre-wrap font-mono text-sm">{status.message}</pre>
						</div>
					)}
				</div>
			</main>
		</div>
	)
}
