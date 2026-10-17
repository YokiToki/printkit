import { createHashRouter, Navigate, type RouteObject } from 'react-router'
import { AppShell } from './AppShell'
import { StartPage } from './StartPage'
import { ModeChooser } from './ModeChooser'
import { GRIDFINITY_PATH, KEYCHAIN_PATH, RACK_PATH } from './modes'
import { productById } from './products'
import { BoxMode } from '../features/box/BoxMode'
import { BaseplateMode } from '../features/baseplate/BaseplateMode'
import { CutoutMode } from '../features/cutout/CutoutMode'
import { ImageMode } from '../features/keychain/ImageMode'
import { ShapeMode } from '../features/keychain/ShapeMode'
import { RackPanelMode } from '../features/rack/RackPanelMode'
import { CaseMode } from '../features/rack/CaseMode'
import { ShelfMode } from '../features/rack/ShelfMode'

/** Прежние адреса режимов (до появления продуктов) ведут на новые. */
const legacy = (mode: string): RouteObject => ({ path: mode, element: <Navigate to={`${GRIDFINITY_PATH}/${mode}`} replace /> })

export const routes: RouteObject[] = [{
  path: '/',
  element: <AppShell />,
  children: [
    { index: true, element: <StartPage /> },
    {
      path: 'gridfinity',
      children: [
        { index: true, element: <ModeChooser product={productById('gridfinity')!} /> },
        { path: 'box', element: <BoxMode /> },
        { path: 'baseplate', element: <BaseplateMode /> },
        { path: 'cutout', element: <CutoutMode /> },
        { path: '*', element: <Navigate to={GRIDFINITY_PATH} replace /> },
      ],
    },
    {
      path: 'keychain',
      children: [
        { index: true, element: <ModeChooser product={productById('keychain')!} /> },
        { path: 'image', element: <ImageMode /> },
        { path: 'shape', element: <ShapeMode /> },
        { path: '*', element: <Navigate to={KEYCHAIN_PATH} replace /> },
      ],
    },
    {
      path: 'rack',
      children: [
        { index: true, element: <ModeChooser product={productById('rack')!} /> },
        { path: 'panel', element: <RackPanelMode /> },
        { path: 'case', element: <CaseMode /> },
        { path: 'shelf', element: <ShelfMode /> },
        { path: '*', element: <Navigate to={RACK_PATH} replace /> },
      ],
    },
    legacy('box'), legacy('baseplate'), legacy('cutout'),
    { path: '*', element: <Navigate to="/" replace /> },
  ],
}]

export const createRouter = () => createHashRouter(routes)
