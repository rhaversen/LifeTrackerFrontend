import { type MetadataRoute } from 'next'

export default function manifest (): MetadataRoute.Manifest {
	return {
		name: 'Life Tracker',
		short_name: 'Life Tracker',
		start_url: '/',
		display: 'standalone',
		background_color: '#fff',
		theme_color: '#fff',
		icons: [
			{
				src: '/favicon.ico',
				sizes: '48x48',
				type: 'image/x-icon'
			},
			{
				src: '/android-chrome-192x192.png?v=1',
				sizes: '192x192',
				type: 'image/png'
			},
			{
				src: '/android-chrome-512x512.png?v=1',
				sizes: '512x512',
				type: 'image/png'
			},
			{
				src: '/apple-touch-icon.png?v=1',
				sizes: '180x180',
				type: 'image/png'
			},
			{
				src: '/favicon-32x32.png?v=1',
				sizes: '32x32',
				type: 'image/png'
			},
			{
				src: '/favicon-16x16.png?v=1',
				sizes: '16x16',
				type: 'image/png'
			}
		]
	}
}
