import Foundation
import Vision
import ImageIO

let directions:[(Int,CGImagePropertyOrientation)] = [(0,.up),(90,.right),(180,.down),(270,.left)]
func inspect(_ file:String) throws -> [[String:Any]] {
    guard let source=CGImageSourceCreateWithURL(URL(fileURLWithPath:file) as CFURL,nil),let image=CGImageSourceCreateImageAtIndex(source,0,nil) else { throw NSError(domain:"光匣",code:1,userInfo:[NSLocalizedDescriptionKey:"照片无法解码。"] ) }
    var candidates:[[String:Any]]=[]
    for (angle,orientation) in directions {
        let request=VNDetectFaceLandmarksRequest()
        try VNImageRequestHandler(cgImage:image,orientation:orientation).perform([request])
        var total=0.0,upright=0.0,count=0
        for face in request.results ?? [] {
            let area=face.boundingBox.width*face.boundingBox.height
            guard face.confidence >= 0.85,area >= 0.0015,let roll=face.roll?.doubleValue,face.landmarks?.allPoints != nil else { continue }
            let weight=min(area,0.2)*Double(face.confidence)
            let tilt=abs(atan2(sin(roll),cos(roll)))
            total+=weight; upright+=weight*max(0,1-tilt/(Double.pi/2));count+=1
        }
        let faceScore:Double=total>0 ? upright/total : 0
        candidates.append(["angle":angle,"faceScore":faceScore,"faceWeight":total,"faces":count,"textScore":0.0,"textChars":0,"textLines":0])
    }
    let ranked=candidates.sorted{($0["faceScore"] as! Double)>($1["faceScore"] as! Double)}
    let top=ranked[0]["faceScore"] as! Double,margin=top-(ranked[1]["faceScore"] as! Double)
    if top < 0.65 || margin < 0.25 {
        for i in candidates.indices {
            let request=VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["en-US","zh-Hans"]
            request.usesLanguageCorrection = false
            request.minimumTextHeight = 0.02
            try VNImageRequestHandler(cgImage:image,orientation:directions[i].1).perform([request])
            var score=0.0,chars=0,lines=0
            for observation in request.results ?? [] {
                guard let text=observation.topCandidates(1).first,text.confidence >= 0.6 else {continue}
                let length=text.string.unicodeScalars.filter{CharacterSet.alphanumerics.contains($0)}.count
                guard length >= 3 else{continue}
                // Vision can read rotated text too. Compare its actual reading baseline,
                // rather than treating successful OCR as proof that the image is upright.
                let bounds=(try? text.boundingBox(for:text.string.startIndex..<text.string.endIndex)) ?? observation
                let swapped=i==1 || i==3
                let dx=Double(bounds.topRight.x-bounds.topLeft.x)*Double(swapped ? image.height : image.width)
                let dy=Double(bounds.topRight.y-bounds.topLeft.y)*Double(swapped ? image.width : image.height)
                let upright=max(0,dx/max(0.0001,hypot(dx,dy)))
                score += Double(min(length,30))*pow(Double(text.confidence),2)*upright
                if upright >= 0.8 { chars += length;lines += 1 }
            }
            candidates[i]["textScore"]=score;candidates[i]["textChars"]=chars;candidates[i]["textLines"]=lines
        }
    }
    return candidates
}
do {
    guard CommandLine.arguments.count==2 else{throw NSError(domain:"光匣",code:2,userInfo:[NSLocalizedDescriptionKey:"缺少照片路径。"])}
    let result=try autoreleasepool{try inspect(CommandLine.arguments[1])}
    let bytes=try JSONSerialization.data(withJSONObject:["candidates":result],options:[.sortedKeys])
    print(String(data:bytes,encoding:.utf8)!)
} catch {
    let bytes=try! JSONSerialization.data(withJSONObject:["error":error.localizedDescription])
    print(String(data:bytes,encoding:.utf8)!);exit(1)
}
