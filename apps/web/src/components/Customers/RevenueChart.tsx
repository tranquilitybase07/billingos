"use client";

import { useState } from "react";
import { ChevronDown, ArrowUpRight, Copy, Download } from "lucide-react";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TableSection } from "./TableSection";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function RevenueChart() {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedBackground, setSelectedBackground] = useState<
    "color" | "silver"
  >("color");

  // Generate date labels for x-axis
  const dates = [
    "Jan 06",
    "Jan 07",
    "Jan 08",
    "Jan 09",
    "Jan 10",
    "Jan 11",
    "Jan 12",
    "Jan 13",
    "Jan 14",
  ];
  const currentDate = "Jan 10, 2026";

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate which date column is being hovered
    const columnWidth = rect.width / dates.length;
    const index = Math.floor(x / columnWidth);

    if (index >= 0 && index < dates.length) {
      setHoveredIndex(index);
      setTooltipPosition({ x, y });
    }
  };

  const handleMouseEnter = () => {
    setTooltipVisible(true);
  };

  const handleMouseLeave = () => {
    setTooltipVisible(false);
    setHoveredIndex(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              className=" font-normal p-2 h-auto bg-muted"
            >
              Revenue
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem>Revenue</DropdownMenuItem>
            <DropdownMenuItem>Net Revenue</DropdownMenuItem>
            <DropdownMenuItem>Cumulative Revenue</DropdownMenuItem>
            <DropdownMenuItem>Net Cumulative Revenue</DropdownMenuItem>
            <DropdownMenuItem>Cost</DropdownMenuItem>
            <DropdownMenuItem>Cumulative Cost</DropdownMenuItem>
            <DropdownMenuItem>Average Order Value</DropdownMenuItem>
            <DropdownMenuItem>Net Average Order Value</DropdownMenuItem>
            <DropdownMenuItem>One-Time Products</DropdownMenuItem>
            <DropdownMenuItem>One-Time Products Revenue</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-base hover:cursor-pointer"
                onClick={() => setIsShareModalOpen(true)}
              >
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Share Chart</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Large Revenue Display */}
      <div className="text-5xl font-light">$0</div>

      {/* Date with indicator */}
      <div className="flex items-center gap-2 text-sm mb-10">
        <div className="h-2 w-2 rounded-full bg-blue-500"></div>
        <span>{currentDate}</span>
      </div>

      {/* Chart Area */}
      <div className="relative">
        {/* inset / expanded background */}
        <div className="absolute inset-[-16px] rounded-xl bg-base" />
        {/* actual chart container */}
        <div className="relative h-80 rounded-lg p-6 pb-12">
          <div
            className="relative h-full w-full"
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Tooltip */}
            {tooltipVisible && hoveredIndex !== null && (
              <div
                className="absolute bg-gray-900/90 backdrop-blur-sm border border-gray-800 rounded-lg p-4 min-w-[200px] pointer-events-none z-10 transition-all duration-200 ease-out"
                style={{
                  left: `${(hoveredIndex / (dates.length - 1)) * 100}%`,
                  top: `${tooltipPosition.y}px`,
                  transform:
                    hoveredIndex >= dates.length - 2
                      ? "translate(calc(-100% - 2px), -30%)"
                      : "translate(10px, -50%)",
                }}
              >
                <div className="text-xs text-gray-400 mb-2">Current Period</div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                    <span className="text-sm">Current</span>
                  </div>
                  <span className="text-sm font-medium">$0</span>
                </div>
              </div>
            )}

            {/* Vertical lines */}
            {dates.map((_, index) => (
              <div
                key={index}
                className="absolute top-0 h-full w-px bg-border"
                style={{
                  left: `${(index / (dates.length - 1)) * 100}%`,
                }}
              />
            ))}

            {/* Highlight current date */}
            {hoveredIndex !== null && (
              <div
                className="absolute top-0 h-full w-px bg-blue-500/40 transition-all duration-200 "
                style={{
                  left: `${(hoveredIndex / (dates.length - 1)) * 100}%`,
                }}
              />
            )}
          </div>

          {/* Date labels below chart */}
          <div className="relative mt-2">
            {dates.map((date, index) => (
              <span
                key={index}
                className="absolute text-xs text-muted-foreground whitespace-nowrap"
                style={{
                  left: `${(index / (dates.length - 1)) * 100}%`,
                  top: "5px",
                  transform:
                    index === 0
                      ? "translateX(-50%)"
                      : index === dates.length - 1
                        ? "translateX(-50%)"
                        : "translateX(-50%)",
                }}
              >
                {date}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Share Modal */}
      <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
        <DialogContent className="max-w-3xl h-[550px] p-0 overflow-hidden">
          <div className="h-full overflow-y-auto p-6 space-y-6">
            <DialogHeader>
              <DialogTitle className="text-sm font-medium">
                Share Net Revenue Metric
              </DialogTitle>
            </DialogHeader>

            {/* Preview Card */}
            <div className="rounded-2xl p-8 relative overflow-hidden min-h-[400px]">
              <Image
                src={
                  selectedBackground === "color"
                    ? "/color_gradient.jpg"
                    : "/silver_chrome.jpg"
                }
                alt="Background"
                fill
                unoptimized
                className="object-cover rounded-2xl"
              />
              <div className="relative rounded-xl bg-gradient-to-b from-gray-800 to-gray-950 p-8">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-white">
                    Net Revenue
                  </h3>
                  <div className="text-4xl font-light text-white">$0</div>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                    <span>Jan 6 - 16, 2026</span>
                  </div>

                  {/* Chart Preview */}
                  <div className="relative rounded-xl h-35 mt-8  ">
                    <div className="absolute bottom-6 left-0 right-0 h-1 bg-blue-500 rounded-full"></div>
                    <div className="absolute bottom-0 left-0 text-xs text-gray-500">
                      Jan 06
                    </div>
                    <div className="absolute bottom-0 right-0 text-xs text-gray-500">
                      Jan 16
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
                        onClick={() => setSelectedBackground("color")}
                        className={`h-7 w-7 hover:cursor-pointer rounded-full overflow-hidden border-2 transition-all relative ${
                          selectedBackground === "color"
                            ? "border-blue-500"
                            : "border-gray-300"
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
                        onClick={() => setSelectedBackground("silver")}
                        className={`h-7 ml-2 hover:cursor-pointer w-7 rounded-full overflow-hidden border-2 transition-all relative ${
                          selectedBackground === "silver"
                            ? "border-blue-500"
                            : "border-gray-300"
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
    </div>
  );
}
