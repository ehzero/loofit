#!/usr/bin/env swift

import AppKit
import Foundation

struct ScreenshotManifest: Decodable {
  let screenshots: [ScreenshotSpec]
}

struct ScreenshotSpec: Decodable {
  let input: String
  let output: String
  let kicker: String
  let headline: String
}

enum RenderError: LocalizedError {
  case usage
  case invalidImage(String)
  case invalidCanvas(String)
  case encodingFailed(String)

  var errorDescription: String? {
    switch self {
    case .usage:
      return "Usage: swift scripts/render-store-screenshots.swift <manifest.json>"
    case .invalidImage(let path):
      return "Could not load screenshot image: \(path)"
    case .invalidCanvas(let path):
      return "Could not create bitmap canvas for: \(path)"
    case .encodingFailed(let path):
      return "Could not encode PNG output: \(path)"
    }
  }
}

func color(_ hex: String, alpha: CGFloat = 1) -> NSColor {
  let cleaned = hex.replacingOccurrences(of: "#", with: "")
  guard cleaned.count == 6, let value = Int(cleaned, radix: 16) else {
    return NSColor.black.withAlphaComponent(alpha)
  }
  return NSColor(
    calibratedRed: CGFloat((value >> 16) & 0xff) / 255,
    green: CGFloat((value >> 8) & 0xff) / 255,
    blue: CGFloat(value & 0xff) / 255,
    alpha: alpha
  )
}

func resolvedPath(_ value: String, from root: String) -> String {
  if value.hasPrefix("/") {
    return value
  }
  return URL(fileURLWithPath: root).appendingPathComponent(value).path
}

func imageWithPixelSize(at path: String) throws -> (image: NSImage, width: Int, height: Int) {
  guard
    let data = FileManager.default.contents(atPath: path),
    let representation = NSBitmapImageRep(data: data)
  else {
    throw RenderError.invalidImage(path)
  }
  let image = NSImage(size: NSSize(width: representation.pixelsWide, height: representation.pixelsHigh))
  image.addRepresentation(representation)
  return (image, representation.pixelsWide, representation.pixelsHigh)
}

func drawText(
  _ value: String,
  top: CGFloat,
  x: CGFloat,
  width: CGFloat,
  canvasHeight: CGFloat,
  font: NSFont,
  foreground: NSColor,
  lineHeightMultiple: CGFloat = 1
) {
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = .left
  paragraph.lineBreakMode = .byWordWrapping
  paragraph.lineHeightMultiple = lineHeightMultiple
  let attributes: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: foreground,
    .paragraphStyle: paragraph,
  ]
  let measured = (value as NSString).boundingRect(
    with: NSSize(width: width, height: .greatestFiniteMagnitude),
    options: [.usesLineFragmentOrigin, .usesFontLeading],
    attributes: attributes
  )
  let height = ceil(measured.height)
  (value as NSString).draw(
    in: NSRect(x: x, y: canvasHeight - top - height, width: width, height: height),
    withAttributes: attributes
  )
}

func drawHeatmapMotif(canvasWidth: CGFloat, canvasHeight: CGFloat) {
  let square = max(18, canvasWidth * 0.018)
  let gap = square * 0.42
  let originX = canvasWidth * 0.72
  let originTop = canvasHeight * 0.033
  let opacities: [CGFloat] = [0.035, 0.055, 0.08, 0.12]

  for column in 0..<5 {
    for row in 0..<4 {
      let opacity = opacities[(column + row) % opacities.count]
      let x = originX + CGFloat(column) * (square + gap)
      let top = originTop + CGFloat(row) * (square + gap)
      let rect = NSRect(
        x: x,
        y: canvasHeight - top - square,
        width: square,
        height: square
      )
      color("#CFF56A", alpha: opacity).setFill()
      NSBezierPath(roundedRect: rect, xRadius: square * 0.22, yRadius: square * 0.22).fill()
    }
  }
}

func render(_ spec: ScreenshotSpec, root: String) throws {
  let inputPath = resolvedPath(spec.input, from: root)
  let outputPath = resolvedPath(spec.output, from: root)
  let source = try imageWithPixelSize(at: inputPath)
  let canvasWidth = source.width
  let canvasHeight = source.height

  guard
    let canvas = NSBitmapImageRep(
      bitmapDataPlanes: nil,
      pixelsWide: canvasWidth,
      pixelsHigh: canvasHeight,
      bitsPerSample: 8,
      samplesPerPixel: 4,
      hasAlpha: false,
      isPlanar: false,
      colorSpaceName: .deviceRGB,
      bytesPerRow: 0,
      bitsPerPixel: 0
    ),
    let graphics = NSGraphicsContext(bitmapImageRep: canvas)
  else {
    throw RenderError.invalidCanvas(outputPath)
  }

  canvas.size = NSSize(width: canvasWidth, height: canvasHeight)
  let width = CGFloat(canvasWidth)
  let height = CGFloat(canvasHeight)
  let fullRect = NSRect(x: 0, y: 0, width: width, height: height)

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = graphics

  let background = NSGradient(colors: [color("#101015"), color("#050506")])
  background?.draw(in: fullRect, angle: 90)

  let glowRect = NSRect(
    x: -width * 0.12,
    y: height * 0.42,
    width: width * 0.86,
    height: width * 0.86
  )
  NSGradient(
    starting: color("#CFF56A", alpha: 0.12),
    ending: color("#CFF56A", alpha: 0)
  )?.draw(
    fromCenter: NSPoint(x: glowRect.midX, y: glowRect.midY),
    radius: 0,
    toCenter: NSPoint(x: glowRect.midX, y: glowRect.midY),
    radius: glowRect.width * 0.5,
    options: [.drawsBeforeStartingLocation, .drawsAfterEndingLocation]
  )
  drawHeatmapMotif(canvasWidth: width, canvasHeight: height)

  let margin = width * 0.079
  let kickerSize = min(max(width * 0.031, 40), 62)
  let headlineSize = min(max(width * 0.07, 90), 118)
  drawText(
    spec.kicker,
    top: height * 0.041,
    x: margin,
    width: width - margin * 2,
    canvasHeight: height,
    font: NSFont.systemFont(ofSize: kickerSize, weight: .bold),
    foreground: color("#CFF56A")
  )
  drawText(
    spec.headline,
    top: height * 0.077,
    x: margin,
    width: width - margin * 2,
    canvasHeight: height,
    font: NSFont.systemFont(ofSize: headlineSize, weight: .heavy),
    foreground: color("#F4F4F2"),
    lineHeightMultiple: 0.92
  )

  let desiredWidth = floor(width * 0.77)
  let sourceAspect = CGFloat(source.height) / CGFloat(source.width)
  let captureTop = height * 0.225
  let bottomMargin = max(14, height * 0.005)
  let maxHeight = height - captureTop - bottomMargin
  let captureWidth = min(desiredWidth, maxHeight / sourceAspect)
  let captureHeight = captureWidth * sourceAspect
  let captureRect = NSRect(
    x: floor((width - captureWidth) * 0.5),
    y: bottomMargin,
    width: captureWidth,
    height: captureHeight
  )
  let radius = captureWidth * 0.052
  let capturePath = NSBezierPath(
    roundedRect: captureRect,
    xRadius: radius,
    yRadius: radius
  )

  NSGraphicsContext.saveGraphicsState()
  let shadow = NSShadow()
  shadow.shadowColor = NSColor.black.withAlphaComponent(0.72)
  shadow.shadowBlurRadius = width * 0.032
  shadow.shadowOffset = NSSize(width: 0, height: -width * 0.012)
  shadow.set()
  color("#141416").setFill()
  capturePath.fill()
  NSGraphicsContext.restoreGraphicsState()

  NSGraphicsContext.saveGraphicsState()
  capturePath.addClip()
  source.image.draw(
    in: captureRect,
    from: NSRect(
      x: 0,
      y: 0,
      width: CGFloat(source.width),
      height: CGFloat(source.height)
    ),
    operation: .copy,
    fraction: 1,
    respectFlipped: true,
    hints: [.interpolation: NSImageInterpolation.high]
  )
  NSGraphicsContext.restoreGraphicsState()

  color("#2A2A2F").setStroke()
  capturePath.lineWidth = max(2, width * 0.0015)
  capturePath.stroke()

  NSGraphicsContext.restoreGraphicsState()

  guard
    let png = canvas.representation(
      using: NSBitmapImageRep.FileType.png,
      properties: [:]
    )
  else {
    throw RenderError.encodingFailed(outputPath)
  }
  try FileManager.default.createDirectory(
    at: URL(fileURLWithPath: outputPath).deletingLastPathComponent(),
    withIntermediateDirectories: true
  )
  try png.write(
    to: URL(fileURLWithPath: outputPath),
    options: Data.WritingOptions.atomic
  )

  let rendered = try imageWithPixelSize(at: outputPath)
  guard rendered.width == canvasWidth, rendered.height == canvasHeight else {
    throw RenderError.encodingFailed(outputPath)
  }
  print("Rendered \(outputPath) (\(rendered.width)x\(rendered.height))")
}

do {
  guard CommandLine.arguments.count == 2 else {
    throw RenderError.usage
  }
  let root = FileManager.default.currentDirectoryPath
  let manifestPath = resolvedPath(CommandLine.arguments[1], from: root)
  let manifestData = try Data(contentsOf: URL(fileURLWithPath: manifestPath))
  let manifest = try JSONDecoder().decode(ScreenshotManifest.self, from: manifestData)
  for screenshot in manifest.screenshots {
    try render(screenshot, root: root)
  }
} catch {
  FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
  exit(1)
}
