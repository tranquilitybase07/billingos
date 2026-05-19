'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { toPng } from 'html-to-image'
import { Area, AreaChart, XAxis, YAxis } from 'recharts'
import { ArrowUpRight01Icon } from 'hugeicons-react'
import {
    CardFlat,
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

interface MetricChartCardProps {
    title: string
    value?: string
    description?: string
    data: { date: string; value: number }[]
    config: ChartConfig
    dataKey?: string
}

export function MetricChartCard({
    title,
    value,
    description,
    data,
    config,
    dataKey = 'value',
}: MetricChartCardProps) {
    const [isShareModalOpen, setIsShareModalOpen] = useState(false)
    const [selectedBackground, setSelectedBackground] = useState<
        'color' | 'silver'
    >('color')
    const [isDownloading, setIsDownloading] = useState(false)
    const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
    const previewRef = useRef<HTMLDivElement>(null)

    const formatRangeDate = (raw?: string) => {
        if (!raw) return ''
        const [year, month] = raw.split('-')
        if (!year || !month) return raw
        const d = new Date(Number(year), Number(month) - 1, 1)
        return d.toLocaleString('en-US', { month: 'short', year: 'numeric' })
    }

    const startDate = formatRangeDate(data[0]?.date) || 'Jan 2025'
    const endDate = formatRangeDate(data[data.length - 1]?.date) || 'Dec 2025'

    const handleDownload = async () => {
        if (!previewRef.current) return
        setIsDownloading(true)
        try {
            const dataUrl = await toPng(previewRef.current, {
                cacheBust: true,
                pixelRatio: 2,
            })
            const link = document.createElement('a')
            link.download = `${title.toLowerCase().replace(/\s+/g, '-')}-billingos.png`
            link.href = dataUrl
            link.click()
        } catch (err) {
            console.error('Failed to download chart image', err)
        } finally {
            setIsDownloading(false)
        }
    }

    const handleCopy = async () => {
        if (!previewRef.current) return
        try {
            const dataUrl = await toPng(previewRef.current, {
                cacheBust: true,
                pixelRatio: 2,
            })
            const blob = await (await fetch(dataUrl)).blob()
            await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob }),
            ])
            setCopyState('copied')
            setTimeout(() => setCopyState('idle'), 1500)
        } catch (err) {
            console.error('Failed to copy chart image', err)
        }
    }

    return (
        <CardFlat>
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
                                <ArrowUpRight01Icon size={16} className="text-muted-foreground" />
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
                        <YAxis hide domain={['dataMin', 'auto']} />
                        <ChartTooltip
                            cursor={false}
                            content={(props) => <ChartTooltipContent {...props} indicator="line" />}
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
                <DialogContent className="max-w-3xl p-0 overflow-hidden">
                    <div className="p-6 space-y-6">
                        <DialogHeader>
                            <DialogTitle className="text-sm font-medium">
                                Share {title} Metric
                            </DialogTitle>
                        </DialogHeader>

                        {/* Preview Card */}
                        <div ref={previewRef} className="rounded-2xl p-6 relative overflow-hidden">
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
                            <div className="relative rounded-xl bg-gradient-to-b from-gray-800 to-gray-950 p-6 pb-4">
                                <div className="space-y-3">
                                    <h3 className="text-base font-medium text-white">
                                        {title}
                                    </h3>
                                    <div className="text-3xl font-light text-white">{value || '$0'}</div>
                                    <div className="flex items-center gap-2 text-sm text-white/60">
                                        <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                                        <span>{startDate} – {endDate}</span>
                                    </div>

                                    {/* Chart Preview */}
                                    <div className="mt-6 w-full">
                                        <div className="relative h-24 w-full">
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
                                        </div>
                                        <div className="mt-3 flex items-center justify-between text-xs text-white/40">
                                            <span>{startDate}</span>
                                            <span>{endDate}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Branding */}
                            <div className="relative mt-6 flex items-center justify-center gap-2">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 217 218"
                                    fill="none"
                                    className="h-6 w-6"
                                >
                                    <path d="M41.5 193.5L22 174.5L73.5 121.5H0.5V94H75L21.5 42L41 22L93.5 74.5V0.5H122V74.5L174.5 22L194 42L142 94H216.5V122H126C123.381 123.252 122.422 124.382 122 127.5V217H93.5V142L41.5 193.5Z" fill="#1570EF" stroke="#1570EF" />
                                    <rect x="159.016" y="139.862" width="54.2889" height="28.145" rx="14.0725" transform="rotate(44 159.016 139.862)" fill="white" />
                                </svg>
                                <span className="text-xl font-semibold tracking-tight text-white">
                                    BillingOS
                                </span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between">
                            <div className="flex gap-2">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                onClick={() => setSelectedBackground('color')}
                                                className={`h-7 w-7 hover:cursor-pointer rounded-full overflow-hidden border-2 transition-all relative ${selectedBackground === 'color'
                                                    ? 'border-blue-500'
                                                    : 'border-border'
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
                                                    : 'border-border'
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
                                    onClick={handleCopy}
                                >
                                    {copyState === 'copied' ? 'Copied!' : 'Copy'}
                                </Button>
                                <Button
                                    className="hover:cursor-pointer"
                                    onClick={handleDownload}
                                    disabled={isDownloading}
                                >
                                    {isDownloading ? 'Downloading...' : 'Download'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </CardFlat>
    )
}
