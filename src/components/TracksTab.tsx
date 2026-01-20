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
	const [showRenameModal, setShowRenameModal] = useState(false)
	const [renameOldName, setRenameOldName] = useState('')
	const [renameNewName, setRenameNewName] = useState('')
	const [renaming, setRenaming] = useState(false)

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

	const fetchTrackNames = useCallback(async (): Promise<void> => {
		try {
			const response = await axios.get<Track[]>(`${API_URL}/v1/tracks`, {
				withCredentials: true
			})
			const allNames = [...new Set(response.data.map(t => t.trackName))].sort()
			setTrackNames(['All', ...allNames])
		} catch (error) {
			console.error('Failed to fetch track names:', error)
		}
	}, [])

	useEffect(() => {
		fetchTrackNames().catch(console.error)
	}, [fetchTrackNames])

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

	const handleRename = useCallback(async (): Promise<void> => {
		const oldName = renameOldName.trim()
		const newName = renameNewName.trim()

		if (!oldName || !newName) {
			alert('Please fill in both fields.')
			return
		}

		if (oldName === newName) {
			alert('New name must be different from old name.')
			return
		}

		setRenaming(true)
		try {
			const response = await axios.patch<{ modifiedCount: number }>(
				`${API_URL}/v1/tracks/bulk/rename`,
				{ oldName, newName },
				{ withCredentials: true }
			)

			alert(`Successfully renamed ${response.data.modifiedCount} track${response.data.modifiedCount !== 1 ? 's' : ''}`)
			setShowRenameModal(false)
			setRenameOldName('')
			setRenameNewName('')

			// Refresh track names and tracks
			await fetchTrackNames()
			await fetchTracks()

			// Select the new track name
			setSelectedTrackName(newName)
		} catch (error) {
			console.error('Failed to rename tracks:', error)
			alert('Failed to rename tracks. Please try again.')
		} finally {
			setRenaming(false)
		}
	}, [renameOldName, renameNewName, fetchTrackNames, fetchTracks])

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
						<div className="flex items-center justify-between gap-2 mb-3">
							<span className="text-sm font-medium text-gray-300">{'Filter by Track Type:'}</span>
							<button
								onClick={() => {
									setRenameOldName(selectedTrackName === 'All' ? '' : selectedTrackName)
									setRenameNewName('')
									setShowRenameModal(true)
								}}
								className="px-3 py-1 text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 rounded transition-colors"
							>
								{'Rename Track Type'}
							</button>
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
						{loading ? (
							<tr>
								<td colSpan={4} className="px-6 py-12 text-center">
									<div className="flex items-center justify-center gap-2">
										<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
										<span className="text-gray-400">{'Loading...'}</span>
									</div>
								</td>
							</tr>
						) : displayTracks.length === 0 ? (
							<tr>
								<td colSpan={4} className="px-6 py-12 text-center text-gray-400">
									{showProblematic ? 'No problematic tracks found' : 'No tracks found'}
								</td>
							</tr>
						) : (
							displayTracks.map((track, index) => {
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
							}))
						}
					</tbody>
				</table>
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

			{showRenameModal && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
					<div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700">
						<h3 className="text-xl font-bold mb-4 text-white">{'Rename Track Type'}</h3>
						<div className="space-y-4">
							<div>
								<label className="block text-sm font-medium text-gray-300 mb-2">
									{'Old Track Name'}
								</label>
								<select
									value={renameOldName}
									onChange={(e) => setRenameOldName(e.target.value)}
									className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
								>
									<option value="">{'Select a track name'}</option>
									{trackNames.filter(name => name !== 'All').map((name) => (
										<option key={name} value={name}>{name}</option>
									))}
								</select>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-300 mb-2">
									{'New Track Name'}
								</label>
								<input
									type="text"
									value={renameNewName}
									onChange={(e) => setRenameNewName(e.target.value)}
									className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
									placeholder="Enter new track name"
								/>
							</div>
						</div>
						<div className="flex justify-end gap-3 mt-6">
							<button
								onClick={() => {
									setShowRenameModal(false)
									setRenameOldName('')
									setRenameNewName('')
								}}
								disabled={renaming}
								className="px-4 py-2 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded disabled:opacity-50"
							>
								{'Cancel'}
							</button>
							<button
								onClick={handleRename}
								disabled={renaming || !renameOldName || !renameNewName}
								className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{renaming ? 'Renaming...' : 'Rename'}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
