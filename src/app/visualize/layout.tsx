import { type Metadata } from 'next'

export const metadata: Metadata = {
	title: {
		template: '%s | Life Stats',
		default: 'Visualize'
	},
	alternates: {
		canonical: 'https://life-stats.net/visualize'
	}
}

export default function VisualizeLayout ({
	children
}: Readonly<{
	children: React.ReactNode
}>): React.JSX.Element {
	return <section>
		{children}
	</section>
}
