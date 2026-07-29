import ExpoModulesCore

public final class RumblyNativeSearchRestaurantRowModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RumblyNativeSearchRestaurantRow")

    View(RumblyNativeSearchRestaurantRowView.self) {
      Events("onAction")

      Prop("rowJSON") { (view: RumblyNativeSearchRestaurantRowView, rowJSON: String) in
        view.setRowJSON(rowJSON)
      }
    }
  }
}
