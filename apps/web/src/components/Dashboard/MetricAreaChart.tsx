'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Area, AreaChart, XAxis, YAxis } from 'recharts'
import { ArrowUpRight } from 'lucide-react'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import {
    ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

interface MetricAreaChartProps {
    title: string
    value?: string
    description?: string
    data: { date: string; value: number }[]
    config: ChartConfig
    dataKey?: string
}

export function MetricAreaChart({
    title,
    value,
    description,
    data,
    config,
    dataKey = 'value',
}: MetricAreaChartProps) {
    const [isShareModalOpen, setIsShareModalOpen] = useState(false)
    const [selectedBackground, setSelectedBackground] = useState<
        'color' | 'silver'
    >('color')

    // Get date range for preview
    const startDate = data[0]?.date || 'Jan 01'
    const endDate = data[data.length - 1]?.date || 'Dec 31'

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                    <CardTitle className="text-sm font-medium">{title}</CardTitle>
                    {value && <div className="text-2xl font-normal mt-2">{value}</div>}
                    {description && <CardDescription>{description}</CardDescription>}
                </div>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-muted -mt-1 -mr-2"
                                onClick={() => setIsShareModalOpen(true)}
                            >
                                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Share Chart</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </CardHeader>
            <CardContent className="p-0">
                <ChartContainer config={config}>
                    <AreaChart
                        accessibilityLayer
                        data={data}
                        margin={{
                            left: 0,
                            right: 0,
                            top: 12,
                            bottom: 12,
                        }}
                    >
                        <defs>
                            <linearGradient id={`fill${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                                <stop
                                    offset="5%"
                                    stopColor={`var(--color-${dataKey})`}
                                    stopOpacity={0.3}
                                />
                                <stop
                                    offset="95%"
                                    stopColor={`var(--color-${dataKey})`}
                                    stopOpacity={0}
                                />
                            </linearGradient>
                        </defs>

                        <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            tickFormatter={(value) => value.slice(0, 3)}
                            hide
                        />
                        {/* Hide Y Axis for cleaner look in small cards, or keep if needed */}
                        <YAxis hide domain={['dataMin', 'auto']} />
                        <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent indicator="line" />}
                        />
                        <Area
                            dataKey={dataKey}
                            type="monotone"
                            fill={`url(#fill${title.replace(/\s+/g, '')})`}
                            fillOpacity={0.4}
                            stroke={`var(--color-${dataKey})`}
                        />
                    </AreaChart>
                </ChartContainer>
            </CardContent>

            {/* Share Modal */}
            <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
                <DialogContent className="max-w-3xl h-[550px] p-0 overflow-hidden">
                    <div className="h-full overflow-y-auto p-6 space-y-6">
                        <DialogHeader>
                            <DialogTitle className="text-sm font-medium">
                                Share {title} Metric
                            </DialogTitle>
                        </DialogHeader>

                        {/* Preview Card */}
                        <div className="rounded-2xl p-8 relative overflow-hidden min-h-[400px]">
                            <Image
                                src={
                                    selectedBackground === 'color'
                                        ? '/color_gradient.jpg'
                                        : '/silver_chrome.jpg'
                                }
                                alt="Background"
                                fill
                                unoptimized
                                className="object-cover rounded-2xl"
                            />
                            <div className="relative rounded-xl bg-gradient-to-b from-gray-800 to-gray-950 p-8">
                                <div className="space-y-4">
                                    <h3 className="text-lg font-medium text-white">
                                        {title}
                                    </h3>
                                    <div className="text-4xl font-light text-white">{value || '$0'}</div>
                                    <div className="flex items-center gap-2 text-sm text-gray-400">
                                        <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                                        <span>{startDate} - {endDate}</span>
                                    </div>

                                    {/* Chart Preview */}
                                    <div className="relative h-32 mt-8 w-full">
                                        <ChartContainer config={config} className="h-full w-full aspect-auto">
                                            <AreaChart
                                                accessibilityLayer
                                                data={data}
                                                margin={{
                                                    left: 0,
                                                    right: 0,
                                                    top: 0,
                                                    bottom: 0,
                                                }}
                                            >
                                                <defs>
                                                    <linearGradient id={`fillPreview${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                                                        <stop
                                                            offset="5%"
                                                            stopColor={config[dataKey]?.color || `var(--color-${dataKey})`}
                                                            stopOpacity={0.3}
                                                        />
                                                        <stop
                                                            offset="95%"
                                                            stopColor={config[dataKey]?.color || `var(--color-${dataKey})`}
                                                            stopOpacity={0}
                                                        />
                                                    </linearGradient>
                                                </defs>
                                                <Area
                                                    dataKey={dataKey}
                                                    type="monotone"
                                                    fill={`url(#fillPreview${title.replace(/\s+/g, '')})`}
                                                    fillOpacity={0.4}
                                                    stroke={config[dataKey]?.color || `var(--color-${dataKey})`}
                                                    strokeWidth={2}
                                                />
                                            </AreaChart>
                                        </ChartContainer>
                                        <div className="absolute bottom-0 left-0 text-xs text-gray-500 translate-y-full pt-2">
                                            {startDate}
                                        </div>
                                        <div className="absolute bottom-0 right-0 text-xs text-gray-500 translate-y-full pt-2">
                                            {endDate}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Polar Logo */}
                            <div className="relative mt-10 flex items-center justify-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                                    <div className="h-6 w-6 rounded-full border-2 border-white"></div>
                                </div>
                                <span className="text-3xl font-medium text-white">
                                    Billing OS
                                </span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between mt-6">
                            <div className="flex gap-2">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                onClick={() => setSelectedBackground('color')}
                                                className={`h-7 w-7 hover:cursor-pointer rounded-full overflow-hidden border-2 transition-all relative ${selectedBackground === 'color'
                                                    ? 'border-blue-500'
                                                    : 'border-gray-300'
                                                    }`}
                                            >
                                                <Image
                                                    src="/color_gradient.jpg"
                                                    alt="Color gradient"
                                                    fill
                                                    unoptimized
                                                    className="object-cover"
                                                />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Color</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                onClick={() => setSelectedBackground('silver')}
                                                className={`h-7 ml-2 hover:cursor-pointer w-7 rounded-full overflow-hidden border-2 transition-all relative ${selectedBackground === 'silver'
                                                    ? 'border-blue-500'
                                                    : 'border-gray-300'
                                                    }`}
                                            >
                                                <Image
                                                    src="/silver_chrome.jpg"
                                                    alt="Silver chrome"
                                                    fill
                                                    unoptimized
                                                    className="object-cover"
                                                />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Monochrome</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <div className="flex gap-3">
                                <Button
                                    variant="ghost"
                                    className="hover:bg-base hover:cursor-pointer"
                                >
                                    Copy
                                </Button>
                                <Button className="hover:cursor-pointer">Download</Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    )
}
