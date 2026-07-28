import ExpoModulesCore

public final class RumblyNativeMenuModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RumblyNativeMenu")

    View(RumblyNativeMenuView.self) {
      Events("onAction", "onActiveCategoryChange", "onScrollOffsetChange")

      Prop("menuJSON") { (view: RumblyNativeMenuView, menuJSON: String) in
        view.setMenuJSON(menuJSON)
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
        (view: RumblyNativeMenuView, itemId: String) in
        view.scrollToItem(itemId)
      }
    }
  }
}
