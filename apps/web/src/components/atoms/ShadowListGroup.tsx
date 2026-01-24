const ShadowListGroup: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div className="ring-border bg-card w-full overflow-hidden rounded-2xl ring-1">
    {children}
  </div>
)

const ShadowListGroupItem: React.FC<React.PropsWithChildren> = ({
  children,
}) => (
  <div className="border-border border-t p-5 first:border-t-0">
    {children}
  </div>
)

export default Object.assign(ShadowListGroup, {
  Item: ShadowListGroupItem,
})
