import StackPreview from './components/StackPreview.vue'

const DEFAULT_COMPONENT_NAME = 'StackPreview'

const withInstall = component => {
  const installable = component
  installable.install = app => {
    const componentName = installable.name || DEFAULT_COMPONENT_NAME
    app.component(componentName, installable)
  }
  return installable
}

const StackPreviewComponent = withInstall(StackPreview)

export default StackPreviewComponent
export { StackPreviewComponent as StackPreview }
