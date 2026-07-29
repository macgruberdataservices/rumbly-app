import ExpoModulesCore
import SwiftUI

private struct NativeMenuItem: Codable, Identifiable, Equatable {
  let anchorId: String
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

  var id: String { anchorId }

  private enum CodingKeys: String, CodingKey {
    case anchorId
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
    anchorId = try values.decodeIfPresent(String.self, forKey: .anchorId) ?? itemId
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

private enum NativeMenuEntry: Identifiable {
  case section(String)
  case item(NativeMenuItem, showsDivider: Bool)

  var id: String {
    switch self {
    case .section(let title):
      return "section:\(title)"
    case .item(let item, _):
      return "item:\(item.anchorId)"
    }
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
  private var targetAnchorId: String?

  var actionHandler: ((String, String) -> Void)?
  var activeCategoryHandler: ((String) -> Void)?
  var scrollOffsetHandler: ((CGFloat) -> Void)?
  var readyHandler: (() -> Void)?
  private var hasSignaledReady = false

  func update(menuJSON: String) {
    guard let data = menuJSON.data(using: .utf8) else {
      sections = []
      return
    }
    do {
      let decoded = try JSONDecoder().decode([NativeMenuSection].self, from: data)
      let previousStructure = sections.map { section in
        [section.title] + section.items.map(\.anchorId)
      }
      let nextStructure = decoded.map { section in
        [section.title] + section.items.map(\.anchorId)
      }
      sections = decoded
      if previousStructure != nextStructure {
        scrollOriginY = nil
        lastScrollOffset = 0
        scrollOffsetHandler?(0)
        requestTargetScrollIfAvailable()
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

  func setTargetAnchorId(_ anchorId: String?) {
    guard targetAnchorId != anchorId else { return }
    targetAnchorId = anchorId
    if anchorId == nil {
      scrollRequest = nil
      return
    }
    requestTargetScrollIfAvailable()
  }

  private func requestTargetScrollIfAvailable() {
    guard
      let targetAnchorId,
      sections.contains(where: { section in
        section.items.contains(where: { $0.anchorId == targetAnchorId })
      })
    else {
      return
    }
    scroll(to: "item:\(targetAnchorId)")
  }

  func scrollToItem(_ itemId: String, category: String) {
    guard
      let section = sections.first(where: { $0.title == category }),
      let item = section.items.first(where: { $0.itemId == itemId })
    else {
      return
    }
    scroll(to: "item:\(item.anchorId)")
  }

  func signalReady() {
    guard !hasSignaledReady else { return }
    hasSignaledReady = true
    readyHandler?()
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
  public let onReady = EventDispatcher()

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
    model.readyHandler = { [weak self] in
      self?.onReady([:])
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

  public func setTargetAnchorId(_ targetAnchorId: String?) {
    model.setTargetAnchorId(targetAnchorId)
  }

  public func scrollToCategory(_ category: String) {
    model.scroll(to: "section:\(category)")
  }

  public func scrollToItem(_ itemId: String, category: String) {
    model.scrollToItem(itemId, category: category)
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
  @State private var persistentScrollTarget: String?
  @State private var persistentScrollAnchor: UnitPoint = .top

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
    } else if #available(iOS 17.0, *) {
      modernMenu
    } else {
      legacyMenu
    }
  }

  @available(iOS 17.0, *)
  private var modernMenu: some View {
    menuScrollView
      // Unlike ScrollViewReader.scrollTo(), this binding retains the requested
      // destination while LazyVStack creates its off-screen rows. Search
      // navigation can therefore provide the target before the row has been
      // materialized without losing the request.
      .scrollPosition(id: $persistentScrollTarget, anchor: persistentScrollAnchor)
      .onAppear {
        model.signalReady()
        applyPersistentTarget(model.scrollRequest, animated: false)
      }
      .onChange(of: model.scrollRequest) { request in
        applyPersistentTarget(request, animated: true)
      }
  }

  private var legacyMenu: some View {
    ScrollViewReader { proxy in
      menuScrollView
        .onAppear {
          model.signalReady()
          guard let request = model.scrollRequest else { return }
          DispatchQueue.main.async {
            withAnimation(.snappy(duration: 0.32)) {
              proxy.scrollTo(request.target, anchor: .top)
            }
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

  private var menuScrollView: some View {
    ScrollView {
      // scrollPosition requires the layout marked by scrollTargetLayout() to
      // be the ScrollView's content layout. Wrapping it in another VStack made
      // SwiftUI accept the requested ID without ever moving to that row.
      menuRows
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
      // LazyVStack only reports headings that currently have live views. Do
      // not select a heading merely because it entered at the bottom.
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
  }

  @ViewBuilder
  private var menuRows: some View {
    if #available(iOS 17.0, *) {
      rows
        .scrollTargetLayout()
    } else {
      rows
    }
  }

  private var rows: some View {
    // Search destinations must exist before the initial programmatic scroll.
    // A LazyVStack can defer section-five rows until after the one startup
    // request has already been resolved, while an eager VStack gives
    // ScrollViewReader/scrollPosition a complete set of stable row IDs.
    // Restaurant menus are bounded enough that eagerly laying out their
    // compact rows is an acceptable tradeoff for deterministic navigation.
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

      // Keep every header and item in one ForEach. scrollTargetLayout only
      // registered the outer section children in the previous nested
      // ForEach, so section-pill targets worked while exact item IDs were
      // silently ignored.
      ForEach(menuEntries) { entry in
        switch entry {
        case .section(let title):
          Text(title.uppercased())
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
                    title:
                      geometry.frame(in: .named("rumblyMenuList")).minY
                  ]
                )
              }
            }
            .id(entry.id)

        case .item(let item, let showsDivider):
          NativeSwipeMenuRow(
            item: item,
            showsDivider: showsDivider,
            model: model
          )
          .id(entry.id)
        }
      }
    }
  }

  private var menuEntries: [NativeMenuEntry] {
    model.sections.flatMap { section in
      var entries: [NativeMenuEntry] = [.section(section.title)]
      entries.append(
        contentsOf: section.items.enumerated().map { index, item in
          .item(item, showsDivider: index < section.items.count - 1)
        }
      )
      return entries
    }
  }

  @available(iOS 17.0, *)
  private func applyPersistentTarget(_ request: ScrollRequest?, animated: Bool) {
    guard let request else {
      persistentScrollTarget = nil
      return
    }

    // A new request can intentionally point at the same row (for example,
    // tapping the active category after manually scrolling away). Clear the
    // binding first so SwiftUI treats it as a fresh positioning command.
    if persistentScrollTarget == request.target {
      persistentScrollTarget = nil
    }
    // Exact search-result items read best in context at mid-screen. Section
    // pills still behave like navigation headings and align to the top.
    persistentScrollAnchor = request.target.hasPrefix("item:") ? .center : .top
    DispatchQueue.main.async {
      if animated {
        withAnimation(.snappy(duration: 0.32)) {
          persistentScrollTarget = request.target
        }
      } else {
        persistentScrollTarget = request.target
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
    CGFloat(actionCount) * 60
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
          .frame(width: 184, height: 1)
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
    .frame(width: 60)
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

private struct NativeSearchItemRowPayload: Codable, Equatable {
  let itemId: String
  let name: String
  let restaurant: String
  let meta: String
  let price: String
  let rating: String?
  let highlightQuery: String?
  let isNew: Bool
  let isNeeded: Bool
  let isLoved: Bool
  let gotItCount: Int
  let needItEnabled: Bool
  let gotItEnabled: Bool
}

@MainActor
private final class NativeSearchItemRowModel: ObservableObject {
  @Published var row: NativeSearchItemRowPayload?
  @Published var isOpen = false
  var actionHandler: ((String, String) -> Void)?

  func update(rowJSON: String) {
    guard let data = rowJSON.data(using: .utf8) else {
      row = nil
      return
    }
    do {
      row = try JSONDecoder().decode(NativeSearchItemRowPayload.self, from: data)
    } catch {
      row = nil
      #if DEBUG
      print("[RumblyNativeSearchItemRow] Could not decode row payload: \(error)")
      #endif
    }
  }

  func sendAction(_ action: String) {
    guard let itemId = row?.itemId else { return }
    actionHandler?(action, itemId)
  }
}

public final class RumblyNativeSearchItemRowView: ExpoView {
  public let onAction = EventDispatcher()

  private let model = NativeSearchItemRowModel()
  private var hostingController: UIHostingController<NativeSearchItemRowRootView>!

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    model.actionHandler = { [weak self] action, itemId in
      self?.onAction(["action": action, "itemId": itemId])
    }

    hostingController = UIHostingController(
      rootView: NativeSearchItemRowRootView(model: model)
    )
    hostingController.view.backgroundColor = .clear
    hostingController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(hostingController.view)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    hostingController.view.frame = bounds
  }

  public func setRowJSON(_ rowJSON: String) {
    model.update(rowJSON: rowJSON)
  }
}

private struct NativeSearchItemRowRootView: View {
  @ObservedObject var model: NativeSearchItemRowModel
  @State private var dragTranslation: CGFloat = 0
  @State private var horizontalDrag = false

  private var actionCount: Int {
    guard let row = model.row else { return 1 }
    return 1 + (row.needItEnabled ? 1 : 0) + (row.gotItEnabled ? 1 : 0)
  }

  private var actionWidth: CGFloat {
    CGFloat(actionCount) * 60
  }

  private var rowOffset: CGFloat {
    min(0, max(-actionWidth, (model.isOpen ? -actionWidth : 0) + dragTranslation))
  }

  var body: some View {
    if let row = model.row {
      ZStack(alignment: .trailing) {
        actionLayer(row)
          .frame(width: actionWidth)
        slidingContent(row)
      }
      .frame(maxWidth: .infinity, minHeight: 88)
      .clipped()
    } else {
      Color.clear
    }
  }

  @ViewBuilder
  private func slidingContent(_ row: NativeSearchItemRowPayload) -> some View {
    if #available(iOS 18.0, *) {
      content(row)
        .offset(x: rowOffset)
        .animation(.interactiveSpring(response: 0.3, dampingFraction: 0.86), value: model.isOpen)
        .gesture(
          HorizontalPanGesture(
            onChanged: { translation in
              horizontalDrag = true
              dragTranslation = translation
            },
            onEnded: { projectedTranslation in
              guard horizontalDrag else {
                dragTranslation = 0
                return
              }
              let projected =
                (model.isOpen ? -actionWidth : 0) + projectedTranslation
              withAnimation(.interactiveSpring(response: 0.3, dampingFraction: 0.86)) {
                model.isOpen = projected < -actionWidth * 0.42
                dragTranslation = 0
                horizontalDrag = false
              }
            }
          )
        )
    } else {
      content(row)
    }
  }

  private func content(_ row: NativeSearchItemRowPayload) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text(highlightedName(row))
          .font(.system(size: 16, weight: .bold))
          .lineLimit(1)
        Spacer(minLength: 4)
        if row.isNew {
          Text("NEW")
            .font(.system(size: 9, weight: .heavy))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color(red: 0.93, green: 0.72, blue: 0.33))
            .clipShape(RoundedRectangle(cornerRadius: 5))
        }
        if row.isNeeded || row.isLoved || row.gotItCount > 0 {
          Circle()
            .fill(Color(red: 0.54, green: 0.78, blue: 0.88))
            .frame(width: 7, height: 7)
        }
      }

      Text(row.restaurant)
        .font(.system(size: 14))
        .lineLimit(1)

      HStack(spacing: 8) {
        Text(row.meta)
          .font(.system(size: 13))
          .foregroundStyle(.secondary)
          .lineLimit(1)
        Spacer(minLength: 4)
        if !row.price.isEmpty {
          Text(row.price)
            .font(.system(size: 14))
        }
        if let rating = row.rating, !rating.isEmpty {
          Text(rating)
            .font(.system(size: 12))
            .foregroundStyle(Color(red: 0.68, green: 0.48, blue: 0.08))
        }
      }
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 12)
    .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
    .background(
      rowOffset < -1
        ? Color(red: 0.91, green: 0.91, blue: 0.93)
        : Color.white
    )
    .clipShape(TrailingRoundedRectangle(radius: rowOffset < -1 ? 16 : 0))
    .contentShape(Rectangle())
    .onTapGesture {
      if model.isOpen {
        withAnimation(.snappy) {
          model.isOpen = false
        }
      } else {
        model.sendAction("open")
      }
    }
    .contextMenu {
      Button {
        model.sendAction("share")
      } label: {
        Label("Share", systemImage: "square.and.arrow.up")
      }
      Button {
        model.sendAction("journal")
      } label: {
        Label("Journal", systemImage: "book.closed")
      }
    } preview: {
      VStack(alignment: .leading, spacing: 8) {
        Text(row.name)
          .font(.title3.bold())
        Text(row.restaurant)
          .font(.headline)
        if !row.meta.isEmpty {
          Text(row.meta)
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        if !row.price.isEmpty {
          Text(row.price)
            .font(.headline)
        }
      }
      .padding(20)
      .frame(width: 320, alignment: .leading)
      .background(Color.white)
    }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isButton)
    .accessibilityLabel(row.name)
    .accessibilityValue(
      [row.restaurant, row.meta, row.price, row.rating]
        .compactMap { $0 }
        .filter { !$0.isEmpty }
        .joined(separator: ", ")
    )
    .accessibilityHint("Double tap to open. Swipe left for actions.")
  }

  private func highlightedName(_ row: NativeSearchItemRowPayload) -> AttributedString {
    var value = AttributedString(row.name)
    guard let query = row.highlightQuery?.trimmingCharacters(in: .whitespacesAndNewlines),
          !query.isEmpty,
          let range = value.range(
            of: query,
            options: [.caseInsensitive, .diacriticInsensitive]
          ) else {
      return value
    }
    value[range].backgroundColor = UIColor(
      red: 0.74,
      green: 0.90,
      blue: 0.95,
      alpha: 1
    )
    return value
  }

  private func actionLayer(_ row: NativeSearchItemRowPayload) -> some View {
    HStack(spacing: 0) {
      if row.needItEnabled {
        actionButton(
          title: "Need It",
          systemImage: row.isNeeded ? "star.fill" : "star",
          color: Color(red: 0.35, green: 0.42, blue: 0.95),
          action: "needIt"
        )
      }
      if row.gotItEnabled {
        actionButton(
          title: row.gotItCount > 0 ? "Got It \(row.gotItCount)" : "Got It",
          systemImage: row.gotItCount > 0 ? "checkmark.circle.fill" : "checkmark.circle",
          color: Color(red: 0.78, green: 0.52, blue: 0.08),
          action: "gotIt"
        )
      }
      actionButton(
        title: "Love It",
        systemImage: row.isLoved ? "heart.fill" : "heart",
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
      model.sendAction(action)
      withAnimation(.snappy) {
        model.isOpen = false
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
    }
    .buttonStyle(.plain)
    .frame(width: 60)
  }
}

private struct NativeSearchRestaurantRowPayload: Codable, Equatable {
  let restaurantId: String
  let name: String
  let meta: String
  let highlightQuery: String?
  let isNeeded: Bool
  let isLoved: Bool
  let gotItCount: Int
  let needItEnabled: Bool
  let gotItEnabled: Bool
}

@MainActor
private final class NativeSearchRestaurantRowModel: ObservableObject {
  @Published var row: NativeSearchRestaurantRowPayload?
  @Published var isOpen = false
  var actionHandler: ((String, String) -> Void)?

  func update(rowJSON: String) {
    guard let data = rowJSON.data(using: .utf8) else {
      row = nil
      return
    }
    do {
      row = try JSONDecoder().decode(
        NativeSearchRestaurantRowPayload.self,
        from: data
      )
    } catch {
      row = nil
      #if DEBUG
      print("[RumblyNativeSearchRestaurantRow] Could not decode row payload: \(error)")
      #endif
    }
  }

  func sendAction(_ action: String) {
    guard let restaurantId = row?.restaurantId else { return }
    actionHandler?(action, restaurantId)
  }
}

public final class RumblyNativeSearchRestaurantRowView: ExpoView {
  public let onAction = EventDispatcher()

  private let model = NativeSearchRestaurantRowModel()
  private var hostingController:
    UIHostingController<NativeSearchRestaurantRowRootView>!

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    model.actionHandler = { [weak self] action, restaurantId in
      self?.onAction([
        "action": action,
        "restaurantId": restaurantId,
      ])
    }

    hostingController = UIHostingController(
      rootView: NativeSearchRestaurantRowRootView(model: model)
    )
    hostingController.view.backgroundColor = .clear
    hostingController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(hostingController.view)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    hostingController.view.frame = bounds
  }

  public func setRowJSON(_ rowJSON: String) {
    model.update(rowJSON: rowJSON)
  }
}

private struct NativeSearchRestaurantRowRootView: View {
  @ObservedObject var model: NativeSearchRestaurantRowModel
  @State private var dragTranslation: CGFloat = 0
  @State private var horizontalDrag = false

  private var actionCount: Int {
    guard let row = model.row else { return 1 }
    return 1 + (row.needItEnabled ? 1 : 0) + (row.gotItEnabled ? 1 : 0)
  }

  private var actionWidth: CGFloat {
    CGFloat(actionCount) * 60
  }

  private var rowOffset: CGFloat {
    min(
      0,
      max(
        -actionWidth,
        (model.isOpen ? -actionWidth : 0) + dragTranslation
      )
    )
  }

  var body: some View {
    if let row = model.row {
      ZStack(alignment: .trailing) {
        actionLayer(row)
          .frame(width: actionWidth)
        slidingContent(row)
      }
      .frame(maxWidth: .infinity, minHeight: 76)
      .clipped()
    } else {
      Color.clear
    }
  }

  @ViewBuilder
  private func slidingContent(
    _ row: NativeSearchRestaurantRowPayload
  ) -> some View {
    if #available(iOS 18.0, *) {
      content(row)
        .offset(x: rowOffset)
        .animation(
          .interactiveSpring(response: 0.3, dampingFraction: 0.86),
          value: model.isOpen
        )
        .gesture(
          HorizontalPanGesture(
            onChanged: { translation in
              horizontalDrag = true
              dragTranslation = translation
            },
            onEnded: { projectedTranslation in
              guard horizontalDrag else {
                dragTranslation = 0
                return
              }
              let projected =
                (model.isOpen ? -actionWidth : 0) + projectedTranslation
              withAnimation(
                .interactiveSpring(response: 0.3, dampingFraction: 0.86)
              ) {
                model.isOpen = projected < -actionWidth * 0.42
                dragTranslation = 0
                horizontalDrag = false
              }
            }
          )
        )
    } else {
      content(row)
    }
  }

  private func content(_ row: NativeSearchRestaurantRowPayload) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text(highlightedName(row))
          .font(.system(size: 17, weight: .bold))
          .lineLimit(1)
        Spacer(minLength: 4)
        if row.isNeeded || row.isLoved || row.gotItCount > 0 {
          Circle()
            .fill(Color(red: 0.54, green: 0.78, blue: 0.88))
            .frame(width: 7, height: 7)
        }
      }

      if !row.meta.isEmpty {
        Text(row.meta)
          .font(.system(size: 13))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
    .background(
      rowOffset < -1
        ? Color(red: 0.91, green: 0.91, blue: 0.93)
        : Color.white
    )
    .overlay(alignment: .bottom) {
      Capsule()
        .fill(Color(red: 0.82, green: 0.87, blue: 0.88))
        .frame(width: 184, height: 1)
    }
    .clipShape(TrailingRoundedRectangle(radius: rowOffset < -1 ? 16 : 0))
    .contentShape(Rectangle())
    .onTapGesture {
      if model.isOpen {
        withAnimation(.snappy) {
          model.isOpen = false
        }
      } else {
        model.sendAction("open")
      }
    }
    .contextMenu {
      Button {
        model.sendAction("share")
      } label: {
        Label("Share", systemImage: "square.and.arrow.up")
      }
      Button {
        model.sendAction("journal")
      } label: {
        Label("Journal", systemImage: "book.closed")
      }
    } preview: {
      VStack(alignment: .leading, spacing: 8) {
        Text(row.name)
          .font(.title3.bold())
        if !row.meta.isEmpty {
          Text(row.meta)
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
      }
      .padding(20)
      .frame(width: 320, alignment: .leading)
      .background(Color.white)
    }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isButton)
    .accessibilityLabel(row.name)
    .accessibilityValue(row.meta)
    .accessibilityHint("Double tap to open. Swipe left for actions.")
  }

  private func highlightedName(
    _ row: NativeSearchRestaurantRowPayload
  ) -> AttributedString {
    var value = AttributedString(row.name)
    guard
      let query = row.highlightQuery?.trimmingCharacters(
        in: .whitespacesAndNewlines
      ),
      !query.isEmpty,
      let range = value.range(
        of: query,
        options: [.caseInsensitive, .diacriticInsensitive]
      )
    else {
      return value
    }
    value[range].backgroundColor = UIColor(
      red: 0.74,
      green: 0.90,
      blue: 0.95,
      alpha: 1
    )
    return value
  }

  private func actionLayer(
    _ row: NativeSearchRestaurantRowPayload
  ) -> some View {
    HStack(spacing: 0) {
      if row.needItEnabled {
        actionButton(
          title: "Need It",
          systemImage: row.isNeeded ? "star.fill" : "star",
          color: Color(red: 0.35, green: 0.42, blue: 0.95),
          action: "needIt"
        )
      }
      if row.gotItEnabled {
        actionButton(
          title: row.gotItCount > 0 ? "Got It \(row.gotItCount)" : "Got It",
          systemImage:
            row.gotItCount > 0
              ? "checkmark.circle.fill"
              : "checkmark.circle",
          color: Color(red: 0.78, green: 0.52, blue: 0.08),
          action: "gotIt"
        )
      }
      actionButton(
        title: "Love It",
        systemImage: row.isLoved ? "heart.fill" : "heart",
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
      model.sendAction(action)
      withAnimation(.snappy) {
        model.isOpen = false
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
    }
    .buttonStyle(.plain)
    .frame(width: 60)
  }
}
