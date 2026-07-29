import ExpoModulesCore

public final class RumblyNativeSearchItemRowModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RumblyNativeSearchItemRow")

    View(RumblyNativeSearchItemRowView.self) {
      Events("onAction")

      Prop("rowJSON") { (view: RumblyNativeSearchItemRowView, rowJSON: String) in
        view.setRowJSON(rowJSON)
      }
    }
  }
}
