import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let configuration = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("capacitor.config.json"))) as! [String: Any]
let plistURL = root.appendingPathComponent("ios/App/App/Info.plist")
var plist = try PropertyListSerialization.propertyList(from: Data(contentsOf: plistURL), options: [], format: nil) as! [String: Any]
plist["CFBundleDisplayName"] = configuration["appName"] as! String
plist["UISupportedInterfaceOrientations"] = ["UIInterfaceOrientationPortrait"]
plist["UISupportedInterfaceOrientations~ipad"] = ["UIInterfaceOrientationPortrait"]
try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0).write(to: plistURL)
let assets = root.appendingPathComponent("ios/App/App/Assets.xcassets")
let iconTarget = assets.appendingPathComponent("AppIcon.appiconset/AppIcon-512@2x.png")
try Data(contentsOf: root.appendingPathComponent(".generated/AppIcon-512@2x.png")).write(to: iconTarget)
for name in ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"] {
    try Data(contentsOf: root.appendingPathComponent(".generated/splash.png")).write(to: assets.appendingPathComponent("Splash.imageset/" + name))
}
print("Configured display name, portrait orientation, brand icon and launch assets.")
