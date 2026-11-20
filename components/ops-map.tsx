'use client'

import dynamic from "next/dynamic"

const NetworkMap = dynamic(() => import("@/components/network-map-client"), { ssr: false, loading: () => <div className="map-skeleton" aria-label="Loading network map"/> })
export default NetworkMap
