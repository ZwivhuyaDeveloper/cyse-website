// components/HorizontalTimeline.tsx
"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useInView, AnimatePresence } from "framer-motion";
import * as motion from "motion/react-client";
import {
  GenesisBlockIcon,
  SmartContractIcon,
  DefiProtocolIcon,
  SecurityShieldIcon,
  NetworkScaleIcon,
  GlobalAdoptionIcon,
} from "./Icons";

import arrowsModel from "@/public/assets/Arrows.png";
import bracketsModel from "@/public/assets/Angled_Brackets.png";
import rocketModel from "@/public/assets/Rocket.png";

import Image, { StaticImageData } from "next/image";
// ─────────────────────────────────────
// Types
// ─────────────────────────────────────
interface TimelineMilestone {
  id: string;
  date: string;
  label: string;
  title: string;
  description: string;
  status: "completed" | "active" | "upcoming";
  icon: React.FC<{ className?: string }>;
  image: StaticImageData;
  imageAlt?: string; // Optional image alt text
}

interface TimelineProps {
  milestones: TimelineMilestone[];
  className?: string;
}

// ─────────────────────────────────────
// Timeline Item Component
// ─────────────────────────────────────

const TimelineItem: React.FC<{
  milestone: TimelineMilestone;
  index: number;
  isLast: boolean;
}> = ({ milestone, index, isLast }) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, {
    once: true,
    margin: "-50px",
  });

  const IconComponent = milestone.icon;

  return (
    <motion.div
      ref={ref}
      className="relative flex flex-col items-center shrink-0 w-65 group"
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{
        duration: 0.55,
        delay: index * 0.12,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      {/* ── Date Marker (above track) ── */}
      <div className="mb-5 text-center">
        <motion.div
          viewport={{ amount: 0.9 }}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0, transition: { type: "spring", bounce: 0.4, duration: 1 } }}
        >
          <span
            className="
              font-mono text-[11px] tracking-[0.2em] uppercase
              text-slate-500 dark:text-slate-400
              font-medium
            "
          >
            {milestone.date}
          </span>
        </motion.div>
      </div>

      {/* ── Status Indicator Dot ── */}
      <div className="relative z-10 mb-5">
        <motion.div
          className={`
            w-3.5 h-3.5 rounded-full border-2
            ${
              milestone.status === "completed"
                ? "bg-primary dark:bg-primary border-primary dark:border-primary"
                : milestone.status === "active"
                  ? "bg-white dark:bg-slate-900 border-primary dark:border-primary"
                  : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"
            }
          `}
          viewport={{ amount: 0.9 }}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0, transition: { type: "spring", bounce: 0.4, duration: 1 } }}
        />
        {/* Active pulse ring */}
        {milestone.status === "active" && (
          <motion.div
            className="absolute inset-0 rounded-full border border-primary dark:border-primary"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        )}
      </div>

      {/* ── SVG Icon Card ── */}
      <motion.div
        className={`
          relative mb-4 p-4 rounded-xl
          bg-zinc-200 dark:bg-slate-800 border border-slate-200 
          dark:border-slate-800 shadow-sm group-hover:shadow-md
          transition-shadow duration-300
          ${milestone.status === "active" ? "ring-1 ring-slate-300 dark:ring-slate-600" : ""}
        `}
        viewport={{ amount: 0.9 }}
        initial={{ opacity: 0, y: -30 }}
        whileInView={{ opacity: 1, y: 0, transition: { type: "spring", bounce: 0.4, duration: 1 } }}
      >
        <motion.div
          viewport={{ amount: 0.9 }}
          initial={{ opacity: 0, scale: 0.1 }}
          whileInView={{ opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.4, duration: 1, delay: 0.5 } }}
        >
          <Image
            src={milestone.image}
            alt={milestone.imageAlt ?? milestone.title}
            height={1080}
            width={1080}
            quality={100}
            className="w-44 h-44 mx-auto"          
          />

          {/*<IconComponent
            className={`
              w-11 h-11 mx-auto
              ${
                milestone.status === "completed"
                  ? "text-slate-700 dark:text-slate-300"
                  : milestone.status === "active"
                    ? "text-slate-800 dark:text-slate-200"
                    : "text-slate-400 dark:text-slate-500"
              }
              transition-colors duration-300
            `}
          />*/}
        </motion.div>
      </motion.div>

      {/* ── Content ── */}
      <motion.div
        className="text-center px-2"
        viewport={{ amount: 0.2 }}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0, transition: { type: "spring", bounce: 0.4, duration: 1 } }}
      >
        {/* Label */}
        <p
          className="
            font-sans text-[10px] tracking-[0.25em] uppercase
            text-slate-500 dark:text-slate-400
            mb-1.5 font-semibold
          "
        >
          {milestone.label}
        </p>

        {/* Title */}
        <h4
          className="
            font-sans text-base font-bold leading-tight
            text-slate-900 dark:text-slate-100
            mb-1.5 tracking-tight
          "
        >
          {milestone.title}
        </h4>

        {/* Description */}
        <p
          className="
            font-sans text-xs leading-relaxed
            text-slate-600 dark:text-slate-400
            max-w-50 mx-auto
          "
        >
          {milestone.description}
        </p>
      </motion.div>

      {/* ── Connector line segment (visual only, between items) ── */}
      {!isLast && (
        <div
          className="
            absolute top-17 left-[calc(50%+20px)]
            w-[calc(100%-40px)] h-px
            bg-slate-200 dark:bg-slate-700
            z-0
          "
          aria-hidden="true"
        />
      )}
    </motion.div>
  );
};

// ─────────────────────────────────────
// Main Timeline Component
// ─────────────────────────────────────

const HorizontalTimeline: React.FC<TimelineProps> = ({
  milestones,
  className = "",
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [isHovering, setIsHovering] = useState(false);

  // Check scroll position to toggle arrow visibility
  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll]);

  // Scroll handlers
  const scrollBy = (direction: "left" | "right") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const amount = 320;
    el.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* ── Left Scroll Arrow ── */}
      <AnimatePresence>
        {canScrollLeft && isHovering && (
          <motion.button
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            onClick={() => scrollBy("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white dark:bg-slate-950 
              border border-slate-200 dark:border-slate-700 shadow-lg flex items-center justify-center cursor-pointer 
              hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors duration-200 -ml-5 "
            aria-label="Scroll timeline left"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="text-slate-600 dark:text-slate-300"
            >
              <path
                d="M10 3L5 8L10 13"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Scrollable Timeline Track ── */}
      <div
        ref={scrollContainerRef}
        className="
          overflow-x-auto scrollbar-hide
          pb-4
          scroll-smooth
        "
      >
        {/* Continuous track line */}
        <div className="relative min-w-max px-12">
          {/* The horizontal track */}
          <div
            className="
              absolute top-17 left-12 right-12 h-px
              bg-slate-200 dark:bg-slate-700
            "
            aria-hidden="true"
          />

          {/* Timeline items */}
          <div className="flex gap-0">
            {milestones.map((milestone, index) => (
              <TimelineItem
                key={milestone.id}
                milestone={milestone}
                index={index}
                isLast={index === milestones.length - 1}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Right Scroll Arrow ── */}
      <AnimatePresence>
        {canScrollRight && isHovering && (
          <motion.button
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.2 }}
            onClick={() => scrollBy("right")}
            className="
              absolute right-0 top-1/2 -translate-y-1/2 z-20
              w-10 h-10 rounded-full
              bg-white dark:bg-slate-950
              border border-slate-200 dark:border-slate-700
              shadow-lg
              flex items-center justify-center
              cursor-pointer
              hover:bg-slate-50 dark:hover:bg-slate-700
              transition-colors duration-200
              -mr-5
            "
            aria-label="Scroll timeline right"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="text-slate-600 dark:text-slate-300"
            >
              <path
                d="M6 3L11 8L6 13"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─────────────────────────────────────
// Demo Page with Sample Data
// ─────────────────────────────────────

const sampleMilestones: TimelineMilestone[] = [
  {
    id: "genesis",
    date: "Q1 2026",
    label: "Application Launch",
    title: "Spot Swap",
    description:
      "API based Spot Trading feature and Web3 Wallet integration",
    status: "completed",
    icon: GenesisBlockIcon,
    image: arrowsModel,
    imageAlt: "Arrows Model",
  },
  {
    id: "news",
    date: "Q2 2026",
    label: "Influence",
    title: "News & Research",
    description:
      "AI automation engine for accurate industry News and Research across all markets.",
    status: "completed",
    icon: SmartContractIcon,
    image: bracketsModel,
    imageAlt: "Brackets Model",
  },
  {
    id: "predictions",
    date: "Q3 2026",
    label: "Protocol",
    title: "Prediction Markets",
    description:
      "Layer-2 integration for Prediction markets powered by Polymarket",
    status: "active",
    icon: SmartContractIcon,
    image: rocketModel,
    imageAlt: "Rocket Model",
  },
  /*   {
    id: "contracts",
    date: "Q4 2026",
    label: "Execution",
    title: "Smart Contracts",
    description:
      "Turing-complete contract engine deployed with formal verification framework and gas abstraction.",
    status: "upcoming",
    icon: SmartContractIcon,
  },
  {
    id: "defi",
    date: "Q1 2027",
    label: "Ecosystem",
    title: "DeFi Launch",
    description:
      "Cross-chain liquidity protocol with automated market making and institutional custody integration.",
    status: "upcoming",
    icon: DefiProtocolIcon,
  },
  {
    id: "security",
    date: "Q2 2027",
    label: "Compliance",
    title: "Security Audit",
    description:
      "SOC 2 Type II certification and multi-party computation for institutional key management.",
    status: "upcoming",
    icon: SecurityShieldIcon,
  },
  {
    id: "scaling",
    date: "Q2 2027",
    label: "Infrastructure",
    title: "Network Scaling",
    description:
      "Layer-2 rollup deployment with sub-second finality and 100k transactions per second throughput.",
    status: "upcoming",
    icon: NetworkScaleIcon,
  },
  {
    id: "global",
    date: "Q3 2027",
    label: "Adoption",
    title: "Global Markets",
    description:
      "Multi-jurisdiction regulatory approval across APAC, EMEA, and Americas for institutional access.",
    status: "upcoming",
    icon: GlobalAdoptionIcon,
  }, */
];

export default function Timeline() {
  return (
    <div
      className="min-h-fit bg-white dark:bg-black flex flex-col items-center justify-center
        px-4 pt-18 pb-25 transition-colors duration-300"
    >
      {/* ── Section Header ── */}
      <motion.div
        className="text-center mb-14 justify-center w-full flex"
        viewport={{ amount: 0.9 }}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0, transition: { type: "spring", bounce: 0.4, duration: 1 } }}
      >
        <h2
          className="text-xl sm:text-2xl md:text-3xl lg:text-3xl xl:text-4xl font-bold max-w-xl
            bg-linear-to-b from-black via-slate-800 to-slate-700
            dark:bg-linear-to-b dark:from-white dark:via-slate-200 dark:to-slate-400
            leading-tight bg-clip-text text-transparent w-full text-center"
        >
          Building the future of institutional finance
        </h2>
      </motion.div>

      {/* ── Timeline ── */}
      <HorizontalTimeline milestones={sampleMilestones} className="w-full max-w-7xl" />

      {/* ── Legend ── */}
      <motion.div
        className="mt-12 items-center gap-6 hidden text-xs font-sans text-slate-500 dark:text-slate-400"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
      >
        <span className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-primary dark:bg-primary" />
          Completed
        </span>
        <span className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-primary dark:border-primary bg-white dark:bg-slate-900" />
          Active
        </span>
        <span className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900" />
          Upcoming
        </span>
      </motion.div>
    </div>
  );
}