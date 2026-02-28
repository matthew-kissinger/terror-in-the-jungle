import { SquadCommand } from '../../systems/combat/types'

export interface RadialMenuItem {
  command: SquadCommand
  label: string
  color: string
  icon: string
}

export class SquadRadialMenu {
  private container?: HTMLElement
  private isVisible = false
  private selectedIndex = -1
  private menuItems: RadialMenuItem[] = [
    {
      command: SquadCommand.FOLLOW_ME,
      label: 'FOLLOW ME',
      color: 'rgba(212, 163, 68, 0.9)',
      icon: '→'
    },
    {
      command: SquadCommand.HOLD_POSITION,
      label: 'HOLD POSITION',
      color: 'rgba(201, 86, 74, 0.9)',
      icon: '◉'
    },
    {
      command: SquadCommand.PATROL_HERE,
      label: 'PATROL',
      color: 'rgba(91, 140, 201, 0.9)',
      icon: '⟲'
    },
    {
      command: SquadCommand.RETREAT,
      label: 'RETREAT',
      color: 'rgba(184, 58, 94, 0.9)',
      icon: '←'
    },
    {
      command: SquadCommand.FREE_ROAM,
      label: 'AUTO',
      color: 'rgba(154, 168, 178, 0.9)',
      icon: '✱'
    }
  ]

  private onCommandSelected?: (command: SquadCommand) => void
  private mouseX = 0
  private mouseY = 0
  private centerX = 0
  private centerY = 0
  private radius = 100
  private boundMouseMoveHandler = this.onMouseMove.bind(this)
  private boundTouchMoveHandler = this.onTouchMove.bind(this)
  private boundTouchEndHandler = this.onTouchEnd.bind(this)
  private boundTouchStartHandler = (e: TouchEvent) => e.preventDefault()
  private segmentPaths: SVGPathElement[] = []
  private segmentTexts: SVGTextElement[] = []
  private segmentEnterHandlers: Array<(event: MouseEvent) => void> = []

  constructor() {
    this.setupMouseListener()
    this.createMenuDOM()
  }

  private createMenuDOM(): void {
    this.container = document.createElement('div')
    this.container.id = 'squad-radial-menu'
    this.container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 300px;
      height: 300px;
      z-index: 20000;
      display: none;
      pointer-events: none;
    `

    // Create SVG for radial segments
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '300')
    svg.setAttribute('height', '300')
    svg.setAttribute('viewBox', '0 0 300 300')
    svg.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      filter: drop-shadow(0 0 10px rgba(0, 0, 0, 0.5));
    `

    const centerX = 150
    const centerY = 150
    const innerRadius = 30
    const outerRadius = 120
    const segmentCount = this.menuItems.length
    const anglePerSegment = (Math.PI * 2) / segmentCount

    // Draw background circle
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    bgCircle.setAttribute('cx', String(centerX))
    bgCircle.setAttribute('cy', String(centerY))
    bgCircle.setAttribute('r', String(outerRadius + 10))
    bgCircle.setAttribute('fill', 'rgba(8, 12, 18, 0.7)')
    bgCircle.setAttribute('stroke', 'rgba(255, 255, 255, 0.1)')
    bgCircle.setAttribute('stroke-width', '1')
    svg.appendChild(bgCircle)

    // Draw segments
    this.menuItems.forEach((item, index) => {
      const startAngle = (index - 0.5) * anglePerSegment - Math.PI / 2
      const endAngle = startAngle + anglePerSegment
      const midAngle = startAngle + anglePerSegment / 2

      // Create segment path
      const x1 = centerX + innerRadius * Math.cos(startAngle)
      const y1 = centerY + innerRadius * Math.sin(startAngle)
      const x2 = centerX + outerRadius * Math.cos(startAngle)
      const y2 = centerY + outerRadius * Math.sin(startAngle)
      const x3 = centerX + outerRadius * Math.cos(endAngle)
      const y3 = centerY + outerRadius * Math.sin(endAngle)
      const x4 = centerX + innerRadius * Math.cos(endAngle)
      const y4 = centerY + innerRadius * Math.sin(endAngle)

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      const pathData = `
        M ${x1} ${y1}
        L ${x2} ${y2}
        A ${outerRadius} ${outerRadius} 0 0 1 ${x3} ${y3}
        L ${x4} ${y4}
        A ${innerRadius} ${innerRadius} 0 0 0 ${x1} ${y1}
        Z
      `
      path.setAttribute('d', pathData)
      path.setAttribute('fill', item.color)
      path.setAttribute('opacity', '0.15')
      path.setAttribute('stroke', item.color)
      path.setAttribute('stroke-width', '2')
      path.setAttribute('data-index', String(index))
      const enterHandler = () => this.selectSegment(index)
      this.segmentPaths.push(path)
      this.segmentEnterHandlers.push(enterHandler)
      path.addEventListener('mouseenter', enterHandler)
      svg.appendChild(path)

      // Add text label
      const labelX = centerX + (outerRadius + innerRadius) / 2 * Math.cos(midAngle)
      const labelY = centerY + (outerRadius + innerRadius) / 2 * Math.sin(midAngle)

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('x', String(labelX))
      text.setAttribute('y', String(labelY))
      text.setAttribute('text-anchor', 'middle')
      text.setAttribute('dominant-baseline', 'middle')
      text.setAttribute('font-family', 'Rajdhani, Segoe UI, sans-serif')
      text.setAttribute('font-size', '11')
      text.setAttribute('font-weight', 'bold')
      text.setAttribute('fill', item.color)
      text.setAttribute('pointer-events', 'none')
      text.setAttribute('data-index', String(index))
      text.textContent = item.label
      this.segmentTexts.push(text)
      svg.appendChild(text)

      // Add icon
      const iconX = centerX + (innerRadius + outerRadius) / 2.5 * Math.cos(midAngle)
      const iconY = centerY + (innerRadius + outerRadius) / 2.5 * Math.sin(midAngle)

      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      icon.setAttribute('x', String(iconX))
      icon.setAttribute('y', String(iconY))
      icon.setAttribute('text-anchor', 'middle')
      icon.setAttribute('dominant-baseline', 'middle')
      icon.setAttribute('font-size', '24')
      icon.setAttribute('fill', item.color)
      icon.setAttribute('pointer-events', 'none')
      icon.setAttribute('opacity', '0.7')
      icon.textContent = item.icon
      svg.appendChild(icon)
    })

    // Draw center circle
    const centerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    centerCircle.setAttribute('cx', String(centerX))
    centerCircle.setAttribute('cy', String(centerY))
    centerCircle.setAttribute('r', String(innerRadius - 5))
    centerCircle.setAttribute('fill', 'rgba(8, 12, 18, 0.8)')
    centerCircle.setAttribute('stroke', 'rgba(220, 225, 230, 0.2)')
    centerCircle.setAttribute('stroke-width', '1')
    svg.appendChild(centerCircle)

    // Draw center crosshair
    const crosshairSize = 8
    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line1.setAttribute('x1', String(centerX - crosshairSize))
    line1.setAttribute('y1', String(centerY))
    line1.setAttribute('x2', String(centerX + crosshairSize))
    line1.setAttribute('y2', String(centerY))
    line1.setAttribute('stroke', 'rgba(220, 225, 230, 0.4)')
    line1.setAttribute('stroke-width', '1')
    svg.appendChild(line1)

    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line2.setAttribute('x1', String(centerX))
    line2.setAttribute('y1', String(centerY - crosshairSize))
    line2.setAttribute('x2', String(centerX))
    line2.setAttribute('y2', String(centerY + crosshairSize))
    line2.setAttribute('stroke', 'rgba(220, 225, 230, 0.4)')
    line2.setAttribute('stroke-width', '1')
    svg.appendChild(line2)

    this.container.appendChild(svg)
    document.body.appendChild(this.container)

    // Inject CSS for animations and responsive layout
    if (!document.getElementById('squad-radial-menu-styles')) {
      const style = document.createElement('style')
      style.id = 'squad-radial-menu-styles'
      style.textContent = `
        #squad-radial-menu svg {
          filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.5));
        }
        /* Shrink on small touch screens */
        @media (pointer: coarse) and (max-height: 600px) {
          #squad-radial-menu {
            width: 240px !important;
            height: 240px !important;
          }
          #squad-radial-menu svg {
            width: 240px;
            height: 240px;
          }
        }
        /* Landscape mobile: shift right to avoid minimap overlap */
        @media (pointer: coarse) and (orientation: landscape) {
          #squad-radial-menu {
            left: 55% !important;
          }
        }
      `
      document.head.appendChild(style)
    }
  }

  private setupMouseListener(): void {
    window.addEventListener('mousemove', this.boundMouseMoveHandler)
  }

  private onMouseMove(event: MouseEvent): void {
    this.updateSelection(event.clientX, event.clientY)
  }

  private onTouchMove(event: TouchEvent): void {
    if (!this.isVisible) return
    if (event.touches.length > 0) {
      const touch = event.touches[0]
      this.updateSelection(touch.clientX, touch.clientY)
    }
  }

  private onTouchEnd(event: TouchEvent): void {
    if (!this.isVisible) return
    event.preventDefault()
    this.executeCommand()
  }

  private updateSelection(clientX: number, clientY: number): void {
    this.mouseX = clientX
    this.mouseY = clientY

    if (this.isVisible && this.container) {
      // Track position relative to menu center
      const rect = this.container.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const angle = Math.atan2(this.mouseY - centerY, this.mouseX - centerX)
      const segmentCount = this.menuItems.length
      const anglePerSegment = (Math.PI * 2) / segmentCount
      const normalizedAngle = angle + Math.PI / 2 + anglePerSegment / 2

      let index = Math.floor(normalizedAngle / anglePerSegment) % segmentCount
      if (index < 0) index += segmentCount

      this.selectSegment(index)
    }
  }

  private selectSegment(index: number): void {
    if (index === this.selectedIndex) return

    // Use cached elements for better performance
    this.segmentPaths.forEach((path, i) => {
      if (i === index) {
        path.setAttribute('opacity', '0.4')
        path.setAttribute('stroke-width', '3')
      } else {
        path.setAttribute('opacity', '0.15')
        path.setAttribute('stroke-width', '2')
      }
    })

    this.segmentTexts.forEach((text, i) => {
      if (i === index) {
        text.setAttribute('font-size', '12')
        text.setAttribute('font-weight', 'bold')
        text.setAttribute('opacity', '1')
      } else {
        text.setAttribute('opacity', '1')
      }
    })

    this.selectedIndex = index
  }

  show(): void {
    if (!this.container) return
    this.container.style.display = 'block'
    this.isVisible = true
    this.selectedIndex = -1

    // Add touch listeners on document (container has pointer-events: none)
    document.addEventListener('touchmove', this.boundTouchMoveHandler, { passive: false })
    document.addEventListener('touchend', this.boundTouchEndHandler, { passive: false })
    document.addEventListener('touchstart', this.boundTouchStartHandler, { passive: false })

    // Slow time slightly (optional - remove if not desired)
    this.slowTime(0.6)
  }

  hide(): void {
    if (!this.container) return
    this.container.style.display = 'none'
    this.isVisible = false
    this.selectedIndex = -1

    // Remove touch listeners from document
    document.removeEventListener('touchmove', this.boundTouchMoveHandler)
    document.removeEventListener('touchend', this.boundTouchEndHandler)
    document.removeEventListener('touchstart', this.boundTouchStartHandler)

    this.restoreTime()
  }

  isOpen(): boolean {
    return this.isVisible
  }

  getSelectedCommand(): SquadCommand | null {
    if (this.selectedIndex < 0 || this.selectedIndex >= this.menuItems.length) {
      return null
    }
    return this.menuItems[this.selectedIndex].command
  }

  executeCommand(): void {
    const command = this.getSelectedCommand()
    if (command && this.onCommandSelected) {
      this.onCommandSelected(command)
    }
    this.hide()
  }

  setCommandSelectedCallback(callback: (command: SquadCommand) => void): void {
    this.onCommandSelected = callback
  }

  private slowTime(_factor: number): void {
    // Optional: implement game speed slowdown
    // For now, this is a placeholder for future implementation
  }

  private restoreTime(): void {
    // Restore normal game speed
  }

  dispose(): void {
    window.removeEventListener('mousemove', this.boundMouseMoveHandler)
    
    document.removeEventListener('touchmove', this.boundTouchMoveHandler)
    document.removeEventListener('touchend', this.boundTouchEndHandler)
    document.removeEventListener('touchstart', this.boundTouchStartHandler)

    this.segmentPaths.forEach((path, index) => {
      const handler = this.segmentEnterHandlers[index]
      if (handler) {
        path.removeEventListener('mouseenter', handler)
      }
    })
    this.segmentPaths = []
    this.segmentTexts = []
    this.segmentEnterHandlers = []

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container)
    }

    const styles = document.getElementById('squad-radial-menu-styles')
    if (styles && styles.parentNode) {
      styles.parentNode.removeChild(styles)
    }
  }
}
