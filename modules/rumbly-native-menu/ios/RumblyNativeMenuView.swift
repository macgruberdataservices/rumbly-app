import ExpoModulesCore
import SwiftUI

private struct NativeMenuItem: Codable, Identifiable, Equatable {
  let itemId: String
  let name: String
  let description: String?
  let price: String
  let isNew: Bool
  let rating: String?
  let isNeeded: Bool
  let isLoved: Bool
  let gotItCount: Int
  let needItEnabled: Bool
  let gotItEnabled: Bool

  var id: String { itemId }

  private enum CodingKeys: String, CodingKey {
    case itemId
    case name
    case description
    case price
    case isNew
    case rating
    case isNeeded
    case isLoved
    case gotItCount
    case needItEnabled
    case gotItEnabled
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    itemId = try values.decodeIfPresent(String.self, forKey: .itemId) ?? UUID().uuidString
    name = try values.decodeIfPresent(String.self, forKey: .name) ?? "Menu item"
    description = try values.decodeIfPresent(String.self, forKey: .description)
    price = try values.decodeIfPresent(String.self, forKey: .price) ?? ""
    isNew = try values.decodeIfPresent(Bool.self, forKey: .isNew) ?? false
    rating = try values.decodeIfPresent(String.self, forKey: .rating)
    isNeeded = try values.decodeIfPresent(Bool.self, forKey: .isNeeded) ?? false
    isLoved = try values.decodeIfPresent(Bool.self, forKey: .isLoved) ?? false
    gotItCount = try values.decodeIfPresent(Int.self, forKey: .gotItCount) ?? 0
    needItEnabled =
      try values.decodeIfPresent(Bool.self, forKey: .needItEnabled) ?? false
    gotItEnabled =
      try values.decodeIfPresent(Bool.self, forKey: .gotItEnabled) ?? false
  }
}

private struct NativeMenuSection: Codable, Identifiable, Equatable {
  let title: String
  let items: [NativeMenuItem]

  var id: String { title }

  private enum CodingKeys: String, CodingKey {
    case title
    case items
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    title = try values.decodeIfPresent(String.self, forKey: .title) ?? "Menu"
    items = try values.decodeIfPresent([NativeMenuItem].self, forKey: .items) ?? []
  }
}

private struct ScrollRequest: Equatable {
  let token = UUID()
  let target: String
}

@MainActor
private final class NativeMenuModel: ObservableObject {
  @Published var sections: [NativeMenuSection] = []
  @Published var openItemId: String?
  @Published var scrollRequest: ScrollRequest?
  @Published var highlightedItemId: String?
  @Published var bottomInset: CGFloat = 0
  private(set) var activeCategory: String?
  private var scrollOriginY: CGFloat?
  private var lastScrollOffset: CGFloat = 0

  var actionHandler: ((String, String) -> Void)?
  var activeCategoryHandler: ((String) -> Void)?
  var scrollOffsetHandler: ((CGFloat) -> Void)?

  func update(menuJSON: String) {
    guard let data = menuJSON.data(using: .utf8) else {
      sections = []
      return
    }
    do {
      let decoded = try JSONDecoder().decode([NativeMenuSection].self, from: data)
      let previousStructure = sections.map { section in
        [section.title] + section.items.map(\.itemId)
      }
      let nextStructure = decoded.map { section in
        [section.title] + section.items.map(\.itemId)
      }
      sections = decoded
      if previousStructure != nextStructure {
        scrollOriginY = nil
        lastScrollOffset = 0
        scrollOffsetHandler?(0)
      }
    } catch {
      sections = []
      #if DEBUG
      print("[RumblyNativeMenu] Could not decode menu payload: \(error)")
      #endif
    }
    if let openItemId,
       !sections.contains(where: { section in
         section.items.contains(where: { $0.itemId == openItemId })
       }) {
      self.openItemId = nil
    }
  }

  func sendAction(_ action: String, itemId: String) {
    actionHandler?(action, itemId)
  }

  func setActiveCategory(_ category: String) {
    guard activeCategory != category else { return }
    activeCategory = category
    activeCategoryHandler?(category)
  }

  func scroll(to target: String) {
    scrollRequest = ScrollRequest(target: target)
  }

  func setScrollPosition(_ minY: CGFloat) {
    // Capture the menu's fully-expanded position once. Updating this origin
    // while the React Native header is expanding creates a feedback loop:
    // the reported offset changes the header height, which changes minY,
    // which used to move the origin again. That left the header partially
    // faded and visibly jittering when returning to the top.
    if scrollOriginY == nil {
      scrollOriginY = minY
    }
    guard let scrollOriginY else { return }
    let rawOffset = max(0, scrollOriginY - minY)
    // Geometry can finish a fraction of a point away from its initial value.
    // Treat that as the true top so the RN interpolation restores opacity
    // and height completely.
    let offset = rawOffset < 1.5 ? 0 : rawOffset
    guard abs(offset - lastScrollOffset) >= 0.5 else { return }
    lastScrollOffset = offset
    scrollOffsetHandler?(offset)
  }
}

public final class RumblyNativeMenuView: ExpoView {
  public let onAction = EventDispatcher()
  public let onActiveCategoryChange = EventDispatcher()
  public let onScrollOffsetChange = EventDispatcher()

  private let model = NativeMenuModel()
  private var hostingController: UIHostingController<NativeMenuRootView>!

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    model.actionHandler = { [weak self] action, itemId in
      self?.onAction([
        "action": action,
        "itemId": itemId
      ])
    }
    model.activeCategoryHandler = { [weak self] category in
      self?.onActiveCategoryChange(["category": category])
    }
    model.scrollOffsetHandler = { [weak self] offsetY in
      self?.onScrollOffsetChange(["offsetY": offsetY])
    }

    hostingController = UIHostingController(rootView: NativeMenuRootView(model: model))
    hostingController.view.backgroundColor = .clear
    hostingController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(hostingController.view)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    hostingController.view.frame = bounds
  }

  public func setMenuJSON(_ menuJSON: String) {
    model.update(menuJSON: menuJSON)
  }

  public func scrollToCategory(_ category: String) {
    model.scroll(to: "section:\(category)")
  }

  public func scrollToItem(_ itemId: String) {
    model.scroll(to: "item:\(itemId)")
  }

  public func setHighlightedItemId(_ itemId: String?) {
    model.highlightedItemId = itemId
  }

  public func setBottomInset(_ bottomInset: Double) {
    model.bottomInset = CGFloat(max(0, bottomInset))
  }
}

private struct SectionPositionPreferenceKey: PreferenceKey {
  static var defaultValue: [String: CGFloat] = [:]

  static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
    value.merge(nextValue(), uniquingKeysWith: { _, new in new })
  }
}

private struct ScrollPositionPreferenceKey: PreferenceKey {
  static var defaultValue: CGFloat?

  static func reduce(value: inout CGFloat?, nextValue: () -> CGFloat?) {
    value = nextValue() ?? value
  }
}

private struct TrailingRoundedRectangle: Shape {
  let radius: CGFloat

  func path(in rect: CGRect) -> Path {
    let path = UIBezierPath(
      roundedRect: rect,
      byRoundingCorners: [.topRight, .bottomRight],
      cornerRadii: CGSize(width: radius, height: radius)
    )
    return Path(path.cgPath)
  }
}

private struct NativeMenuRootView: View {
  @ObservedObject var model: NativeMenuModel

  var body: some View {
    if model.sections.isEmpty {
      VStack(spacing: 8) {
        Image(systemName: "fork.knife")
          .font(.title2)
          .foregroundStyle(.secondary)
        Text("Menu unavailable")
          .font(.headline)
        Text("No menu data reached the native list.")
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color.white)
    } else {
      ScrollViewReader { proxy in
        ScrollView {
          VStack(spacing: 0) {
            Color.clear
              .frame(height: 0)
              .background {
                GeometryReader { geometry in
                  Color.clear.preference(
                    key: ScrollPositionPreferenceKey.self,
                    value: geometry.frame(in: .named("rumblyMenuList")).minY
                  )
                }
              }

            LazyVStack(spacing: 0) {
              ForEach(model.sections) { section in
                Text(section.title.uppercased())
                  .font(.system(size: 13, weight: .bold))
                  .tracking(0.5)
                  .foregroundStyle(Color(red: 0.42, green: 0.45, blue: 0.47))
                  .frame(maxWidth: .infinity, alignment: .center)
                  .padding(.horizontal, 18)
                  .padding(.vertical, 12)
                  .background {
                    GeometryReader { geometry in
                      Color.clear.preference(
                        key: SectionPositionPreferenceKey.self,
                        value: [
                          section.title:
                            geometry.frame(in: .named("rumblyMenuList")).minY
                        ]
                      )
                    }
                  }
                  .id("section:\(section.title)")

                ForEach(section.items) { item in
                  NativeSwipeMenuRow(
                    item: item,
                    showsDivider: item.id != section.items.last?.id,
                    model: model
                  )
                  .id("item:\(item.itemId)")
                }
              }
            }
          }
        }
        .background(Color.white)
        .coordinateSpace(name: "rumblyMenuList")
        .safeAreaInset(edge: .bottom) {
          Color.clear.frame(height: model.bottomInset)
        }
        .onPreferenceChange(ScrollPositionPreferenceKey.self) { minY in
          if let minY {
            model.setScrollPosition(minY)
          }
        }
        .onPreferenceChange(SectionPositionPreferenceKey.self) { positions in
          guard !positions.isEmpty else { return }
          // LazyVStack only reports headings that currently have live
          // views. Do not fall back to the first reported heading: while
          // scrolling down that is often the next section merely entering
          // at the bottom of the viewport, which advanced the category rail
          // far too early. Keep the current category until a heading
          // actually crosses the top edge directly beneath the rail.
          let crossed = positions
            .filter { $0.value <= 8 }
            .max(by: { $0.value < $1.value })
          if let category = crossed?.key {
            model.setActiveCategory(category)
          } else if model.activeCategory == nil,
                    let firstCategory = model.sections.first?.title {
            model.setActiveCategory(firstCategory)
          }
        }
        .onChange(of: model.scrollRequest) { request in
          guard let request else { return }
          withAnimation(.snappy(duration: 0.32)) {
            proxy.scrollTo(request.target, anchor: .top)
          }
        }
      }
    }
  }
}

private struct NativeSwipeMenuRow: View {
  let item: NativeMenuItem
  let showsDivider: Bool
  @ObservedObject var model: NativeMenuModel

  @State private var dragTranslation: CGFloat = 0
  @State private var horizontalDrag = false

  private var actionCount: Int {
    1 + (item.needItEnabled ? 1 : 0) + (item.gotItEnabled ? 1 : 0)
  }

  private var actionWidth: CGFloat {
    CGFloat(actionCount) * 74
  }

  private var isOpen: Bool {
    model.openItemId == item.itemId
  }

  private var rowOffset: CGFloat {
    min(0, max(-actionWidth, (isOpen ? -actionWidth : 0) + dragTranslation))
  }

  private var isSliding: Bool {
    rowOffset < -1
  }

  private var isHighlighted: Bool {
    model.highlightedItemId == item.itemId
  }

  var body: some View {
    ZStack(alignment: .trailing) {
      actionLayer
        .frame(width: actionWidth)

      slidingContent
    }
    .frame(minHeight: 76)
    .clipped()
    .onChange(of: model.openItemId) { openId in
      if openId != item.itemId {
        dragTranslation = 0
        horizontalDrag = false
      }
    }
  }

  @ViewBuilder
  private var slidingContent: some View {
    if #available(iOS 18.0, *) {
      content
        .offset(x: rowOffset)
        .animation(
          .interactiveSpring(response: 0.3, dampingFraction: 0.86),
          value: isOpen
        )
        .gesture(
          HorizontalPanGesture(
            onChanged: handleHorizontalDrag,
            onEnded: finishHorizontalDrag
          )
        )
    } else {
      content
        .offset(x: rowOffset)
        .animation(
          .interactiveSpring(response: 0.3, dampingFraction: 0.86),
          value: isOpen
        )
    }
  }

  private var content: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text(item.name)
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(Color(red: 0.10, green: 0.13, blue: 0.14))
          .lineLimit(1)
        Spacer(minLength: 4)
        if item.isNew {
          Text("NEW")
            .font(.system(size: 9, weight: .heavy))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color(red: 0.82, green: 0.61, blue: 0.16))
            .clipShape(RoundedRectangle(cornerRadius: 5))
        }
        if !item.price.isEmpty {
          Text(item.price)
            .font(.system(size: 14))
        }
        if let rating = item.rating, !rating.isEmpty {
          Text(rating)
            .font(.system(size: 12))
            .foregroundStyle(Color(red: 0.68, green: 0.48, blue: 0.08))
        }
      }
      if let description = item.description, !description.isEmpty {
        Text(description)
          .font(.system(size: 13))
          .foregroundStyle(Color(red: 0.42, green: 0.46, blue: 0.48))
          .lineLimit(1)
      }
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 12)
    .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
    .background(
      isSliding
        ? Color(red: 0.91, green: 0.91, blue: 0.93)
        : isHighlighted
          ? Color(red: 0.88, green: 0.95, blue: 0.93)
          : Color.white
    )
    .animation(.easeInOut(duration: 0.2), value: isHighlighted)
    .overlay(alignment: .bottom) {
      if showsDivider {
        Capsule()
          .fill(Color(red: 0.82, green: 0.87, blue: 0.88))
          .frame(width: 92, height: 1)
      }
    }
    .clipShape(TrailingRoundedRectangle(radius: isSliding ? 16 : 0))
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isButton)
    .accessibilityLabel(item.name)
    .accessibilityValue(
      [item.isNew ? "New" : nil, item.price, item.description, item.rating]
        .compactMap { $0 }
        .filter { !$0.isEmpty }
        .joined(separator: ", ")
    )
    .accessibilityHint("Double tap for details. Swipe left for actions.")
    .onTapGesture {
      if isOpen {
        withAnimation(.snappy) {
          model.openItemId = nil
        }
      } else {
        model.sendAction("open", itemId: item.itemId)
      }
    }
    .contextMenu {
      Button {
        model.sendAction("share", itemId: item.itemId)
      } label: {
        Label("Share", systemImage: "square.and.arrow.up")
      }
      Button {
        model.sendAction("journal", itemId: item.itemId)
      } label: {
        Label("Journal", systemImage: "book.closed")
      }
    } preview: {
      VStack(alignment: .leading, spacing: 10) {
        Text(item.name)
          .font(.title3.bold())
        if !item.price.isEmpty {
          Text(item.price)
            .font(.headline)
        }
        if let description = item.description, !description.isEmpty {
          Text(description)
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        Text("Share and Journal actions are coming soon.")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .padding(20)
      .frame(width: 320, alignment: .leading)
      .background(Color.white)
    }
  }

  private var actionLayer: some View {
    HStack(spacing: 0) {
      if item.needItEnabled {
        actionButton(
          title: "Need It",
          systemImage: item.isNeeded ? "star.fill" : "star",
          color: Color(red: 0.35, green: 0.42, blue: 0.95),
          action: "needIt"
        )
      }
      if item.gotItEnabled {
        actionButton(
          title: item.gotItCount > 0 ? "Got It \(item.gotItCount)" : "Got It",
          systemImage: item.gotItCount > 0 ? "checkmark.circle.fill" : "checkmark.circle",
          color: Color(red: 0.78, green: 0.52, blue: 0.08),
          action: "gotIt"
        )
      }
      actionButton(
        title: "Love It",
        systemImage: item.isLoved ? "heart.fill" : "heart",
        color: Color(red: 0.82, green: 0.16, blue: 0.84),
        action: "loveIt"
      )
    }
    .background(Color(red: 0.97, green: 0.97, blue: 0.98))
  }

  private func actionButton(
    title: String,
    systemImage: String,
    color: Color,
    action: String
  ) -> some View {
    Button {
      model.sendAction(action, itemId: item.itemId)
      withAnimation(.snappy) {
        model.openItemId = nil
        dragTranslation = 0
      }
    } label: {
      VStack(spacing: 4) {
        ZStack {
          Circle()
            .fill(color)
            .frame(width: 42, height: 42)
          Image(systemName: systemImage)
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(Color.white)
        }
        Text(title)
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(color)
          .lineLimit(1)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color.clear)
    }
    .buttonStyle(.plain)
    .frame(width: 74)
  }

  private func handleHorizontalDrag(_ translation: CGFloat) {
    horizontalDrag = true
    if model.openItemId != nil && model.openItemId != item.itemId {
      model.openItemId = nil
    }
    dragTranslation = translation
  }

  private func finishHorizontalDrag(_ projectedTranslation: CGFloat) {
    guard horizontalDrag else {
      dragTranslation = 0
      return
    }
    let projected = (isOpen ? -actionWidth : 0) + projectedTranslation
    withAnimation(.interactiveSpring(response: 0.3, dampingFraction: 0.86)) {
      model.openItemId = projected < -actionWidth * 0.42 ? item.itemId : nil
      dragTranslation = 0
      horizontalDrag = false
    }
  }
}

@available(iOS 18.0, *)
private struct HorizontalPanGesture: UIGestureRecognizerRepresentable {
  let onChanged: (CGFloat) -> Void
  let onEnded: (CGFloat) -> Void

  final class Coordinator: NSObject, UIGestureRecognizerDelegate {
    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
      guard let pan = gestureRecognizer as? UIPanGestureRecognizer else {
        return false
      }
      let velocity = pan.velocity(in: pan.view)
      return abs(velocity.x) > abs(velocity.y)
    }

    func gestureRecognizer(
      _ gestureRecognizer: UIGestureRecognizer,
      shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
      true
    }
  }

  func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator {
    Coordinator()
  }

  func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
    let recognizer = UIPanGestureRecognizer()
    recognizer.delegate = context.coordinator
    recognizer.cancelsTouchesInView = false
    return recognizer
  }

  func handleUIGestureRecognizerAction(
    _ recognizer: UIPanGestureRecognizer,
    context: Context
  ) {
    let translation = context.converter.localTranslation?.x
      ?? recognizer.translation(in: recognizer.view).x

    switch recognizer.state {
    case .began, .changed:
      onChanged(translation)
    case .ended:
      let velocity = context.converter.localVelocity?.x
        ?? recognizer.velocity(in: recognizer.view).x
      onEnded(translation + velocity * 0.18)
    case .cancelled, .failed:
      onEnded(translation)
    default:
      break
    }
  }
}
