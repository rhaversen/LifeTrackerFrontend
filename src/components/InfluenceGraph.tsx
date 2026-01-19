'use client'

import { useRef, useEffect, useState, useMemo, type ReactElement } from 'react'

import type { InfluenceEdgeSerializable } from '../utils/continuous/workerTypes'

interface InfluenceGraphProps {
	edges: InfluenceEdgeSerializable[]
	typeNames: string[]
}

interface Node {
	id: string
	x: number
	y: number
	vx: number
	vy: number
}

interface GraphEdge {
	source: string
	target: string
	strength: number
	direction: 'excite' | 'inhibit' | 'neutral'
	massTimeLabel: string
	hazardRatioAt1h: number
}

function getNodeColor (name: string): string {
	let hash = 0
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash)
	}
	const hue = Math.abs(hash % 360)
	return `hsl(${hue}, 60%, 50%)`
}

function initializeNodes (typeNames: string[], width: number, height: number): Map<string, Node> {
	const nodes = new Map<string, Node>()
	const cx = width / 2
	const cy = height / 2
	const radius = Math.min(width, height) * 0.35

	typeNames.forEach((name, i) => {
		const angle = (2 * Math.PI * i) / typeNames.length - Math.PI / 2
		nodes.set(name, {
			id: name,
			x: cx + radius * Math.cos(angle),
			y: cy + radius * Math.sin(angle),
			vx: 0,
			vy: 0
		})
	})

	return nodes
}

function runForceSimulation (
	nodes: Map<string, Node>,
	edges: GraphEdge[],
	width: number,
	height: number,
	iterations: number = 500
): void {
	const cx = width / 2
	const cy = height / 2
	const nodeArray = [...nodes.values()]

	for (let iter = 0; iter < iterations; iter++) {
		const alpha = 1 - iter / iterations

		for (const node of nodeArray) {
			node.vx = 0
			node.vy = 0
		}

		for (let i = 0; i < nodeArray.length; i++) {
			for (let j = i + 1; j < nodeArray.length; j++) {
				const a = nodeArray[i]
				const b = nodeArray[j]
				const dx = b.x - a.x
				const dy = b.y - a.y
				const dist = Math.sqrt(dx * dx + dy * dy) || 1
				const force = 80000 / (dist * dist)
				const fx = (dx / dist) * force
				const fy = (dy / dist) * force
				a.vx -= fx
				a.vy -= fy
				b.vx += fx
				b.vy += fy
			}
		}

		for (const edge of edges) {
			const source = nodes.get(edge.source)
			const target = nodes.get(edge.target)
			if (source === undefined || target === undefined) { continue }

			const dx = target.x - source.x
			const dy = target.y - source.y
			const dist = Math.sqrt(dx * dx + dy * dy) || 1
			const targetDist = 400
			const force = (dist - targetDist) * 0.08 * edge.strength
			const fx = (dx / dist) * force
			const fy = (dy / dist) * force
			source.vx += fx
			source.vy += fy
			target.vx -= fx
			target.vy -= fy
		}

		for (const node of nodeArray) {
			const dx = cx - node.x
			const dy = cy - node.y
			node.vx += dx * 0.01
			node.vy += dy * 0.01
		}

		for (const node of nodeArray) {
			node.vx *= 0.85
			node.vy *= 0.85
			node.x += node.vx * alpha
			node.y += node.vy * alpha

			const margin = 100
			node.x = Math.max(margin, Math.min(width - margin, node.x))
			node.y = Math.max(margin, Math.min(height - margin, node.y))
		}
	}
}

export default function InfluenceGraph ({ edges, typeNames }: InfluenceGraphProps): ReactElement {
	const containerRef = useRef<HTMLDivElement>(null)
	const [dimensions, setDimensions] = useState({ width: 600, height: 400 })
	const [hoveredNode, setHoveredNode] = useState<string | null>(null)
	const [hoveredEdge, setHoveredEdge] = useState<GraphEdge | null>(null)
	const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

	useEffect(() => {
		if (containerRef.current === null) { return }

		const resizeObserver = new ResizeObserver(entries => {
			for (const entry of entries) {
				setDimensions({
					width: entry.contentRect.width,
					height: Math.max(600, Math.min(1000, entry.contentRect.width))
				})
			}
		})

		resizeObserver.observe(containerRef.current)
		return () => { resizeObserver.disconnect() }
	}, [])

	const graphEdges: GraphEdge[] = useMemo(() => {
		return edges.map(e => ({
			source: e.sourceType,
			target: e.targetType,
			strength: e.strength,
			direction: e.direction,
			massTimeLabel: e.massTimeLabel,
			hazardRatioAt1h: e.hazardRatioAt1h
		}))
	}, [edges])

	const nodes = useMemo(() => {
		return initializeNodes(typeNames, dimensions.width, dimensions.height)
	}, [typeNames, dimensions])

	const getEdgeColor = (direction: 'excite' | 'inhibit' | 'neutral'): string => {
		if (direction === 'excite') { return '#ef4444' }
		if (direction === 'inhibit') { return '#3b82f6' }
		return '#6b7280'
	}

	const computeArrowPath = (edge: GraphEdge): string => {
		const source = nodes.get(edge.source)
		const target = nodes.get(edge.target)
		if (source === undefined || target === undefined) { return '' }

		const dx = target.x - source.x
		const dy = target.y - source.y
		const dist = Math.sqrt(dx * dx + dy * dy)
		if (dist === 0) { return '' }

		const nodeRadius = 28
		const arrowSize = 12

		const ux = dx / dist
		const uy = dy / dist

		const startX = source.x + ux * nodeRadius
		const startY = source.y + uy * nodeRadius
		const endX = target.x - ux * (nodeRadius + arrowSize)
		const endY = target.y - uy * (nodeRadius + arrowSize)

		const midX = (startX + endX) / 2
		const midY = (startY + endY) / 2
		const perpX = -uy * 20
		const perpY = ux * 20

		return `M ${startX} ${startY} Q ${midX + perpX} ${midY + perpY} ${endX} ${endY}`
	}

	const isEdgeHighlighted = (edge: GraphEdge): boolean => {
		if (hoveredEdge !== null) {
			return edge.source === hoveredEdge.source && edge.target === hoveredEdge.target
		}
		if (hoveredNode !== null) {
			return edge.source === hoveredNode
		}
		return false
	}

	const isNodeHighlighted = (nodeId: string): boolean => {
		if (hoveredNode !== null) {
			if (nodeId === hoveredNode) { return true }
			return graphEdges.some(e => e.source === hoveredNode && e.target === nodeId)
		}
		if (hoveredEdge !== null) {
			return nodeId === hoveredEdge.source || nodeId === hoveredEdge.target
		}
		return false
	}

	if (typeNames.length === 0) {
		return (
			<div className="text-gray-500 text-center py-8">{'No types to display'}</div>
		)
	}

	return (
		<div ref={containerRef} className="w-full relative">
			<svg
				width={dimensions.width}
				height={dimensions.height}
				className="bg-gray-900/50 rounded-lg"
			>
				<defs>
					<marker
						id="arrowhead-excite"
						markerWidth="12"
						markerHeight="12"
						refX="0"
						refY="6"
						orient="auto"
						markerUnits="userSpaceOnUse"
					>
						<polygon points="0 0, 12 6, 0 12" fill="#ef4444" />
					</marker>
					<marker
						id="arrowhead-inhibit"
						markerWidth="12"
						markerHeight="12"
						refX="0"
						refY="6"
						orient="auto"
						markerUnits="userSpaceOnUse"
					>
						<polygon points="0 0, 12 6, 0 12" fill="#3b82f6" />
					</marker>
					<marker
						id="arrowhead-neutral"
						markerWidth="12"
						markerHeight="12"
						refX="0"
						refY="6"
						orient="auto"
						markerUnits="userSpaceOnUse"
					>
						<polygon points="0 0, 12 6, 0 12" fill="#6b7280" />
					</marker>
				</defs>

				{graphEdges.map((edge, idx) => {
					const highlighted = isEdgeHighlighted(edge)
					const baseOpacity = 0.01 + Math.pow(edge.strength, 3) * 0.99
					const opacity = hoveredNode !== null || hoveredEdge !== null
						? (highlighted ? 1 : 0.005)
						: baseOpacity
					const strokeWidth = highlighted ? 10 : 0.2 + Math.pow(edge.strength, 3) * 10

					const handleMouseMove = (e: React.MouseEvent): void => {
						const rect = containerRef.current?.getBoundingClientRect()
						if (rect !== undefined) {
							setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
						}
					}

					return (
						<g key={`edge-${idx}`}>
							<path
								d={computeArrowPath(edge)}
								fill="none"
								stroke={getEdgeColor(edge.direction)}
								strokeWidth={strokeWidth}
								opacity={opacity}
								markerEnd={`url(#arrowhead-${edge.direction})`}
								className="cursor-pointer"
								onMouseEnter={() => { setHoveredEdge(edge) }}
								onMouseMove={handleMouseMove}
								onMouseLeave={() => { setHoveredEdge(null) }}
							/>
							<path
								d={computeArrowPath(edge)}
								fill="none"
								stroke="transparent"
								strokeWidth={20}
								className="cursor-pointer"
								onMouseEnter={() => { setHoveredEdge(edge) }}
								onMouseMove={handleMouseMove}
								onMouseLeave={() => { setHoveredEdge(null) }}
							/>
						</g>
					)
				})}

				{[...nodes.entries()].map(([name, node]) => {
					const highlighted = isNodeHighlighted(name)
					const opacity = hoveredNode !== null || hoveredEdge !== null
						? (highlighted ? 1 : 0.3)
						: 1

					return (
						<g
							key={name}
							transform={`translate(${node.x}, ${node.y})`}
							className="cursor-pointer"
							onMouseEnter={() => { setHoveredNode(name) }}
							onMouseLeave={() => { setHoveredNode(null) }}
						>
							<circle
								r={28}
								fill={getNodeColor(name)}
								fillOpacity={opacity}
								stroke={highlighted ? '#fff' : 'transparent'}
								strokeWidth={2}
								className="transition-opacity duration-150"
							/>
							<text
								textAnchor="middle"
								dy="0.35em"
								fill="white"
								fontSize="11"
								fontWeight="600"
								fillOpacity={opacity}
								className="pointer-events-none select-none"
							>
								{name.length > 9 ? name.slice(0, 8) + '…' : name}
							</text>
						</g>
					)
				})}
			</svg>

			{hoveredEdge !== null && (
				<div
					className="absolute pointer-events-none z-50 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 shadow-xl text-sm"
					style={{
						left: mousePos.x + 12,
						top: mousePos.y - 40,
						transform: mousePos.x > dimensions.width - 200 ? 'translateX(-100%)' : undefined
					}}
				>
					<div className="flex items-center gap-2">
						<span className="text-white font-medium">{hoveredEdge.source}</span>
						<span className={hoveredEdge.direction === 'excite' ? 'text-red-400' : 'text-blue-400'}>
							{hoveredEdge.direction === 'excite' ? '→' : '⊣'}
						</span>
						<span className="text-white font-medium">{hoveredEdge.target}</span>
					</div>
					<div className="text-gray-400 text-xs mt-1">
						<span>{`HR@1h: ${hoveredEdge.hazardRatioAt1h.toFixed(2)}×`}</span>
						<span className="mx-2">{'•'}</span>
						<span>{`50% by ${hoveredEdge.massTimeLabel}`}</span>
					</div>
				</div>
			)}

			{hoveredNode !== null && hoveredEdge === null && (
				<div className="mt-2 text-center text-sm text-gray-300">
					{hoveredNode}
				</div>
			)}

			<div className="flex justify-center gap-4 mt-3 text-xs text-gray-500">
				<div className="flex items-center gap-1.5">
					<div className="w-3 h-0.5 bg-red-500" />
					<span>{'Excites'}</span>
				</div>
				<div className="flex items-center gap-1.5">
					<div className="w-3 h-0.5 bg-blue-500" />
					<span>{'Inhibits'}</span>
				</div>
			</div>
		</div>
	)
}
