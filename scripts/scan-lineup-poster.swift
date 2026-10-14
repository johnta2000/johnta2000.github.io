// Read-only OCR to help place interaction boxes on original marketing artwork.
// Does not redraw, generate, crop, or alter the image.
import Foundation
import Vision
import AppKit
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let image = NSImage(contentsOf: url)!
var rect = CGRect(origin: .zero, size: image.size)
let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
let names = CommandLine.arguments.count > 2 ? (try JSONSerialization.jsonObject(with: Data(CommandLine.arguments[2].utf8)) as? [String] ?? []) : []
request.customWords = names
try VNImageRequestHandler(cgImage: cgImage).perform([request])
let rows = (request.results ?? []).compactMap { observation -> [String: Any]? in
    guard let candidate = observation.topCandidates(1).first else { return nil }
    let b = observation.boundingBox
    let matches = names.compactMap { name -> [String: Any]? in
        let letters = name.filter { $0.isLetter || $0.isNumber }
        let pattern = "(?<![\\p{L}\\p{N}])" + letters.map { NSRegularExpression.escapedPattern(for: String($0)) }.joined(separator: "[\\s\\p{P}\\p{S}]*") + "(?![\\p{L}\\p{N}])"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = regex.firstMatch(in: candidate.string, range: NSRange(candidate.string.startIndex..., in: candidate.string)),
              let range = Range(match.range, in: candidate.string),
              let result = try? candidate.boundingBox(for: range) else { return nil }
        let box = result.boundingBox
        return ["artist": name, "box": [box.minX, 1 - box.maxY, box.width, box.height]]
    }
    return ["text": candidate.string, "confidence": candidate.confidence,
            "box": [b.minX, 1 - b.maxY, b.width, b.height], "matches": matches]
}
let data = try JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys])
print(String(data: data, encoding: .utf8)!)
