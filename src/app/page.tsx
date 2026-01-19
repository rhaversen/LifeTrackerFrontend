'use client'

import axios from 'axios'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, type ReactElement } from 'react'

import IngressTab from '@/components/IngressTab'
import InsightsTab from '@/components/InsightsTab'
import TracksTab from '@/components/TracksTab'
import VisualizeTab from '@/components/VisualizeTab'

const API_URL = process.env.NEXT_PUBLIC_API_URL

type Tab = 'visualize' | 'insights' | 'ingress' | 'tracks'

export default function Page (): ReactElement {
	const router = useRouter()
	const [activeTab, setActiveTab] = useState<Tab>('visualize')
	const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

	useEffect(() => {
		const checkAuth = async (): Promise<void> => {
			try {
				await axios.get(`${API_URL}/v1/auth/is-authenticated`, { withCredentials: true })
				setIsAuthenticated(true)
			} catch {
				setIsAuthenticated(false)
			}
		}
		checkAuth().catch(console.error)
	}, [])

	const handleLogout = useCallback(async () => {
		try {
			await axios.post(`${API_URL}/v1/auth/logout`, {}, { withCredentials: true })
			setIsAuthenticated(false)
		} catch (error) {
			console.error('Logout failed:', error)
		}
	}, [])

	if (isAuthenticated === null) {
		return (
			<div className="min-h-screen bg-gray-900 flex items-center justify-center">
				<div className="text-gray-300 text-xl">{'Loading...'}</div>
			</div>
		)
	}

	return (
		<div className="min-h-screen bg-gray-900">
			<header className="sticky top-0 z-10 bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4">
				<div className="max-w-7xl mx-auto">
					<div className="flex items-center justify-between mb-3 sm:mb-0">
						<h1 className="text-xl sm:text-2xl font-bold text-white whitespace-nowrap">{'Life Tracker'}</h1>
						<div className="flex items-center gap-2 sm:gap-4">
							{isAuthenticated ? (
								<button
									onClick={handleLogout}
									className="px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors whitespace-nowrap"
								>
									{'Logout'}
								</button>
							) : (
								<div className="flex gap-2">
									<button
										onClick={() => router.push('/signin')}
										className="px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
									>
										{'Sign In'}
									</button>
									<button
										onClick={() => router.push('/signup')}
										className="px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors whitespace-nowrap"
									>
										{'Sign Up'}
									</button>
								</div>
							)}
						</div>
					</div>
					{isAuthenticated && (
						<nav className="flex justify-center gap-4 sm:gap-8 sm:absolute sm:left-1/2 sm:-translate-x-1/2 sm:top-4">
							<button
								onClick={() => setActiveTab('visualize')}
								className={`px-2 py-2 text-sm sm:text-base font-medium transition-colors border-b-2 whitespace-nowrap ${
									activeTab === 'visualize'
										? 'text-blue-400 border-blue-400'
										: 'text-gray-400 border-transparent hover:text-gray-200'
								}`}
							>
								{'Visualize'}
							</button>
							<button							onClick={() => setActiveTab('insights')}
								className={`px-2 py-2 text-sm sm:text-base font-medium transition-colors border-b-2 whitespace-nowrap ${
									activeTab === 'insights'
										? 'text-blue-400 border-blue-400'
										: 'text-gray-400 border-transparent hover:text-gray-200'
								}`}
							>
								{'Insights'}
							</button>
							<button								onClick={() => setActiveTab('ingress')}
								className={`px-2 py-2 text-sm sm:text-base font-medium transition-colors border-b-2 whitespace-nowrap ${
									activeTab === 'ingress'
										? 'text-blue-400 border-blue-400'
										: 'text-gray-400 border-transparent hover:text-gray-200'
								}`}
							>
								{'Import'}
							</button>
							<button
								onClick={() => setActiveTab('tracks')}
								className={`px-2 py-2 text-sm sm:text-base font-medium transition-colors border-b-2 whitespace-nowrap ${
									activeTab === 'tracks'
										? 'text-blue-400 border-blue-400'
										: 'text-gray-400 border-transparent hover:text-gray-200'
								}`}
							>
								{'Tracks'}
							</button>
						</nav>
					)}
				</div>
			</header>

			<main className="max-w-7xl mx-auto px-6 py-8">
				{isAuthenticated ? (
					<>
						{activeTab === 'visualize' && <VisualizeTab />}
						{activeTab === 'insights' && <InsightsTab />}
						{activeTab === 'ingress' && <IngressTab />}
						{activeTab === 'tracks' && <TracksTab />}
					</>
				) : (
					<div className="flex flex-col items-center justify-center py-20">
						<h2 className="text-2xl font-semibold text-gray-200 mb-4">{'Welcome to Life Tracker'}</h2>
						<p className="text-gray-400 text-center max-w-md">
							{'Sign in to track and visualize your life events. Create custom trackers, import historical data, and gain insights through beautiful visualizations.'}
						</p>
					</div>
				)}
			</main>
		</div>
	)
}
