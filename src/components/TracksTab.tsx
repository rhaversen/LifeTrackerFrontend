'use client'

import axios from 'axios'
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'

import type { Track } from '@/types/Track'

const API_URL = process.env.NEXT_PUBLIC_API_URL

export default function TracksTab (): ReactElement {
	const [tracks, setTracks] = useState<Track[]>([])
	const [totalCount, setTotalCount] = useState(0)
	const [loading, setLoading] = useState(true)
	const [showProblematic, setShowProblematic] = useState(false)
	const [page, setPage] = useState(1)
	const [pageSize, setPageSize] = useState(100)
	const [sortField, setSortField] = useState<'date' | 'trackName'>('date')
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
	const [trackNames, setTrackNames] = useState<string[]>([])
	const [selectedTrackName, setSelectedTrackName] = useState<string>('All')

	const fetchTracks = useCallback(async (): Promise<void> => {
		setLoading(true)
		try {
			const sortParam = sortField === 'date'
				? (sortDirection === 'asc' ? 'date' : '-date')
				: (sortDirection === 'asc' ? 'trackName' : '-trackName')

			const response = await axios.get<Track[]>(`${API_URL}/v1/tracks`, {
				withCredentials: true,
				params: {
					trackName: selectedTrackName === 'All' ? undefined : selectedTrackName,
					sort: sortParam,
					limit: pageSize,
					skip: (page - 1) * pageSize
				}
			})
			setTracks(response.data)

			if (page === 1) {
				const countResponse = await axios.get<Track[]>(`${API_URL}/v1/tracks`, {
					withCredentials: true,
					params: {
						trackName: selectedTrackName === 'All' ? undefined : selectedTrackName
					}
				})
				setTotalCount(countResponse.data.length)
			}
		} catch (error) {
			console.error('Failed to fetch tracks:', error)
		} finally {
			setLoading(false)
		}
	}, [sortField, sortDirection, page, pageSize, selectedTrackName])

	useEffect(() => {
		const fetchTrackNames = async (): Promise<void> => {
			try {
				const response = await axios.get<Track[]>(`${API_URL}/v1/tracks`, {
					withCredentials: true
				})
				const allNames = [...new Set(response.data.map(t => t.trackName))].sort()
				setTrackNames(['All', ...allNames])
			} catch (error) {
				console.error('Failed to fetch track names:', error)
			}
		}

		fetchTrackNames().catch(console.error)
	}, [])

	useEffect(() => {
		fetchTracks().catch(console.error)
	}, [fetchTracks])

	useEffect(() => {
		// Reset to page 1 when switching between views or changing sort/filter
		setPage(1)
	}, [showProblematic, sortField, sortDirection, selectedTrackName])

	const handleDelete = useCallback(async (trackId: string): Promise<void> => {
		if (!confirm('Are you sure you want to delete this track?')) {
			return
		}

		try {
			await axios.delete(`${API_URL}/v1/tracks/${trackId}`, {
				data: { confirm: true },
				withCredentials: true
			})
			setTracks(prev => prev.filter(t => t._id !== trackId))
			setTotalCount(prev => prev - 1)
		} catch (error) {
			console.error('Failed to delete track:', error)
			alert('Failed to delete track. Please try again.')
		}
	}, [])

	const problematicTracks = useMemo(() => tracks.filter(track => isNaN(new Date(track.date).getTime())), [tracks])
	const validTracks = useMemo(() => tracks.filter(track => !isNaN(new Date(track.date).getTime())), [tracks])

	const currentTracks = showProblematic ? problematicTracks : validTracks
	const totalPages = Math.ceil(totalCount / pageSize)
	const displayTracks = currentTracks

	const toggleSort = (field: 'date' | 'trackName'): void => {
		if (sortField === field) {
			setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
		} else {
			setSortField(field)
			setSortDirection('asc')
		}
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center py-20">
				<div className="text-gray-300 text-xl">{'Loading...'}</div>
			</div>
		)
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4">
				<div className="flex items-center justify-between flex-wrap gap-4">
					<h2 className="text-2xl font-bold text-gray-200">
						{showProblematic ? 'Problematic Tracks' : 'Latest Tracks'}
					</h2>
					<div className="flex items-center gap-4 flex-wrap">
						{problematicTracks.length > 0 && (
							<button
								onClick={() => setShowProblematic(!showProblematic)}
								className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
									showProblematic
										? 'bg-red-600 text-white'
										: 'bg-gray-700 text-gray-300 hover:bg-gray-600'
								}`}
							>
								{showProblematic
									? 'Show Valid Tracks'
									: `Show ${problematicTracks.length} Problematic Track${problematicTracks.length !== 1 ? 's' : ''}`}
							</button>
						)}
						<div className="flex items-center gap-2">
							<label htmlFor="pageSize" className="text-gray-400 text-sm whitespace-nowrap">{'Per page:'}</label>
							<select
								id="pageSize"
								value={pageSize}
								onChange={(e) => {
									setPageSize(Number(e.target.value))
									setPage(1)
								}}
								className="bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
							>
								<option value={50}>{'50'}</option>
								<option value={100}>{'100'}</option>
								<option value={250}>{'250'}</option>
								<option value={500}>{'500'}</option>
							</select>
						</div>
						<div className="text-gray-400 text-sm whitespace-nowrap">
							{showProblematic
								? `${problematicTracks.length} problematic track${problematicTracks.length !== 1 ? 's' : ''}`
								: `${totalCount.toLocaleString()} total track${totalCount !== 1 ? 's' : ''}`}
						</div>
					</div>
				</div>

				{!showProblematic && trackNames.length > 1 && (
					<div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
						<div className="flex items-center gap-2 mb-3">
							<span className="text-sm font-medium text-gray-300">{'Filter by Track Type:'}</span>
						</div>
						<div className="flex flex-wrap gap-2">
							{trackNames.map((name) => (
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
				)}
			</div>

			{showProblematic && problematicTracks.length > 0 && (
				<div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
					<p className="text-red-300 text-sm">
						<span className="font-bold">{'Warning: '}</span>
						{'These tracks have invalid dates and will not appear in visualizations. You can delete them to clean up your data.'}
					</p>
				</div>
			)}

			{/* Pagination Controls */}
			{!showProblematic && totalPages > 1 && (
				<div className="flex items-center justify-between flex-wrap gap-4 px-4">
					<div className="text-gray-400 text-sm">
						{`Showing ${((page - 1) * pageSize) + 1}-${Math.min(page * pageSize, totalCount)} of ${totalCount.toLocaleString()}`}
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={() => setPage(1)}
							disabled={page === 1}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'First'}
						</button>
						<button
							onClick={() => setPage(p => Math.max(1, p - 1))}
							disabled={page === 1}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'Previous'}
						</button>
						<span className="text-gray-300 text-sm px-3">
							{`Page ${page} of ${totalPages}`}
						</span>
						<button
							onClick={() => setPage(p => Math.min(totalPages, p + 1))}
							disabled={page === totalPages}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'Next'}
						</button>
						<button
							onClick={() => setPage(totalPages)}
							disabled={page === totalPages}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'Last'}
						</button>
					</div>
				</div>
			)}

			<div className="bg-gray-800 rounded-lg overflow-hidden">
				<table className="w-full">
					<thead className="bg-gray-700">
						<tr>
							<th
								onClick={() => toggleSort('trackName')}
								className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
							>
								<div className="flex items-center gap-1">
									{'Track Name'}
									{sortField === 'trackName' && (
										<span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
									)}
								</div>
							</th>
							<th
								onClick={() => toggleSort('date')}
								className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600 transition-colors"
							>
								<div className="flex items-center gap-1">
									{'Date'}
									{sortField === 'date' && (
										<span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
									)}
								</div>
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
								{'Time'}
							</th>
							<th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
								{'Actions'}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-700">
						{displayTracks.map((track, index) => {
							const date = new Date(track.date)
							const isInvalid = isNaN(date.getTime())
							return (
								<tr key={track._id ?? index} className={`hover:bg-gray-750 ${isInvalid ? 'bg-red-900/10' : ''}`}>
									<td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-200">
										{track.trackName}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
										{isInvalid ? (
											<span className="text-red-400 font-mono">{String(track.date)}</span>
										) : (
											date.toLocaleDateString('en-GB', {
												day: '2-digit',
												month: 'short',
												year: 'numeric'
											})
										)}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
										{isInvalid ? (
											<span className="text-red-400">{'Invalid Date'}</span>
										) : (
											date.toLocaleTimeString('en-GB', {
												hour: '2-digit',
												minute: '2-digit',
												second: '2-digit'
											})
										)}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-right text-sm">
										<button
											onClick={() => handleDelete(track._id!)}
											className="text-red-400 hover:text-red-300 font-medium transition-colors"
										>
											{'Delete'}
										</button>
									</td>
								</tr>
							)
						})}
					</tbody>
				</table>

				{displayTracks.length === 0 && (
					<div className="px-6 py-12 text-center text-gray-400">
						{showProblematic ? 'No problematic tracks found' : 'No tracks found'}
					</div>
				)}
			</div>

			{/* Bottom Pagination Controls */}
			{!showProblematic && totalPages > 1 && (
				<div className="flex items-center justify-between flex-wrap gap-4 px-4">
					<div className="text-gray-400 text-sm">
						{`Showing ${((page - 1) * pageSize) + 1}-${Math.min(page * pageSize, totalCount)} of ${totalCount.toLocaleString()}`}
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={() => setPage(1)}
							disabled={page === 1}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'First'}
						</button>
						<button
							onClick={() => setPage(p => Math.max(1, p - 1))}
							disabled={page === 1}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'Previous'}
						</button>
						<span className="text-gray-300 text-sm px-3">
							{`Page ${page} of ${totalPages}`}
						</span>
						<button
							onClick={() => setPage(p => Math.min(totalPages, p + 1))}
							disabled={page === totalPages}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'Next'}
						</button>
						<button
							onClick={() => setPage(totalPages)}
							disabled={page === totalPages}
							className="px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{'Last'}
						</button>
					</div>
				</div>
			)}
		</div>
	)
}
