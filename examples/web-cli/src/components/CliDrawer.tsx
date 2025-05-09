"use client"

import React from "react"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { cn } from "../lib/utils"

interface CliDrawerProps {
  // This would be your actual terminal component
  TerminalComponent?: React.ComponentType<object>
}

const DRAWER_OPEN_KEY = "ablyCliDrawerOpen";
const DRAWER_HEIGHT_KEY = "ablyCliDrawerHeight";

export function CliDrawer({ TerminalComponent }: CliDrawerProps) {
  // Initialize state directly to false
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try {
      const savedOpen = localStorage.getItem(DRAWER_OPEN_KEY);
      // Ensure parsing happens correctly and default to false on error or null
      return savedOpen ? !!JSON.parse(savedOpen) : false;
    } catch (error) {
      console.error("Error reading drawer open state from localStorage:", error);
      return false; // Default to closed on error
    }
  });

  // Use state for height, load initial value below
  const [height, setHeight] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false)
  const [startY, setStartY] = useState(0)
  const [startHeight, setStartHeight] = useState(0)
  const drawerRef = useRef<HTMLDivElement>(null)
  const dragHandleRef = useRef<HTMLDivElement>(null)

  // Restore useEffect for loading height from localStorage, default to 40%
  useEffect(() => {
    const savedHeight = localStorage.getItem(DRAWER_HEIGHT_KEY);
    const defaultHeight = window.innerHeight * 0.4; // Default 40% vh
    const initialHeight = savedHeight ? Number.parseInt(savedHeight) : defaultHeight;
    setHeight(initialHeight);
  }, []);

  // Restore useEffect for saving height to localStorage
  useEffect(() => {
    if (height > 0) { // Save height whenever it's valid, not just when closed
      localStorage.setItem(DRAWER_HEIGHT_KEY, height.toString());
    }
  }, [height]);

  // Add useEffect for saving open state to localStorage
  useEffect(() => {
    localStorage.setItem(DRAWER_OPEN_KEY, JSON.stringify(isOpen));
  }, [isOpen]);

  // Handle mouse events for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return

      const deltaY = e.clientY - startY
      const newHeight = Math.max(200, Math.min(window.innerHeight * 0.8, startHeight - deltaY))

      setHeight(newHeight)
    }

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false)
        document.body.style.cursor = "default"
        // Height saving is now handled by the other useEffect
        // localStorage.setItem(DRAWER_HEIGHT_KEY, height.toString())
      }
    }

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, startY, startHeight])

  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true)
    setStartY(e.clientY)
    setStartHeight(height)
    document.body.style.cursor = "ns-resize"
  }

  const toggleDrawer = () => {
    setIsOpen(!isOpen)
  }

  // Terminal icon component embedded directly in this file
  const TerminalIcon = ({ className }: { className?: string }) => (
    <div
      className={`bg-transparent border border-white rounded-sm flex items-start justify-start p-0.5 ${className || ""}`}
    >
      <span className="text-[10px] leading-none text-white font-mono">{">"}_</span>
    </div>
  )

  // Add logging just before render
  console.log(`[CliDrawer Render] isOpen = ${isOpen}`);

  return (
    <>
      {/* Tab button when drawer is closed */}
      {!isOpen && (
        <button
          onClick={toggleDrawer}
          className="fixed bottom-0 left-4 z-50 flex items-center gap-2 bg-[#1a1d24] text-white px-3 py-1.5 rounded-t-md shadow-lg hover:bg-[#252a35] transition-colors border-t border-l border-r border-[#2a2f3a] z-50"
        >
          <TerminalIcon className="w-5 h-4" />
          <span className="font-medium text-sm">Ably CLI</span>
        </button>
      )}

      {/* Conditionally render the entire drawer content only when open */}
      {isOpen && (
        <div
          ref={drawerRef}
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 text-white shadow-lg flex flex-col",
          )}
          style={{ height: `${height}px` }}
        >
          {/* Drag handle */}
          <div
            ref={dragHandleRef}
            className="absolute top-0 left-0 right-0 h-3 cursor-ns-resize bg-gray-700 rounded-t-md flex-shrink-0"
            onMouseDown={handleDragStart}
          >
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-16 h-1 bg-gray-500 rounded-full mt-[3px]" />
          </div>

          {/* Header bar */}
          <div className="flex items-center justify-between px-4 h-10 bg-zinc-900 flex-shrink-0 border-b border-gray-700 mt-3">
            <div className="flex items-center gap-3">
              <TerminalIcon className="w-5 h-4" />
              <span className="font-medium text-sm">Ably Shell</span>
              <span className="text-xs px-2 py-0.5 bg-[#3A3A3A] text-[#F5A623] rounded-sm font-medium">TEST MODE</span>
            </div>
            <button
              onClick={toggleDrawer}
              className="p-1 hover:text-gray-300 rounded-md transition-colors"
              aria-label="Close drawer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Terminal content area */}
          <div className="flex-grow p-4 overflow-auto font-mono text-sm bg-black min-h-0 w-full">
            {TerminalComponent && <TerminalComponent />}
          </div>
        </div>
      )}
    </>
  )
}
