import ExpoModulesCore

public final class RumblyNativeMenuModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RumblyNativeMenu")

    View(RumblyNativeMenuView.self) {
      Events("onAction", "onActiveCategoryChange", "onScrollOffsetChange", "onReady")

      Prop("menuJSON") { (view: RumblyNativeMenuView, menuJSON: String) in
        view.setMenuJSON(menuJSON)
      }

      Prop("targetAnchorId") {
        (view: RumblyNativeMenuView, targetAnchorId: String?) in
        view.setTargetAnchorId(targetAnchorId)
      }

      Prop("highlightedItemId") {
        (view: RumblyNativeMenuView, highlightedItemId: String?) in
        view.setHighlightedItemId(highlightedItemId)
      }

      Prop("bottomInset") {
        (view: RumblyNativeMenuView, bottomInset: Double) in
        view.setBottomInset(bottomInset)
      }

      AsyncFunction("scrollToCategory") {
        (view: RumblyNativeMenuView, category: String) in
        view.scrollToCategory(category)
      }

      AsyncFunction("scrollToItem") {
        (view: RumblyNativeMenuView, itemId: String, category: String) in
        view.scrollToItem(itemId, category: category)
      }
    }
  }
}
